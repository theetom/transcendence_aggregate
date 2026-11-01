"""Local Public API Tester demo, started with sh scripts/start.sh.

Standalone option: python3 demos/public-api-tester/server.py

Standard library only. Browser -> loopback connector -> verified HTTPS public API.
Explicit tester controls manage one temporary recipe.
API keys and demo tracking live in this process's memory, not files.
"""

import argparse
from email import policy
from email.parser import BytesParser
from http.client import HTTPSConnection
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import secrets
import socket
import ssl
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import build_opener, HTTPRedirectHandler, HTTPSHandler, ProxyHandler, Request


ROOT = Path(__file__).resolve().parent
COOKIE = 'public_api_tester_session'
KEY_PATTERN = re.compile(r'rpk_[a-f0-9]{32}\.[A-Za-z0-9_-]{43}')
SESSION_TTL = 3600
MAX_SESSIONS = 32
MAX_RESPONSE = 2 * 1024 * 1024
MAX_PHOTO = 5 * 1024 * 1024
DEMO_TITLE = 'API demo recipe'


class DemoState:
    def __init__(self):
        self.lock = threading.Lock()
        self.recipe = None
        self.recipe_id = None
        self.deleted = False
        self.uncertain = False
        self.evidence = None

    def payload(self, *, connected=False):
        return {
            'connected': connected, 'recipe': self.recipe, 'deleted': self.deleted,
            'uncertain': self.uncertain, 'busy': self.lock.locked(), 'evidence': self.evidence,
        }


class DemoError(Exception):
    def __init__(self, status, message, upstream_status=None, retry_after=None):
        self.status = status
        self.payload = {'error': message}
        if upstream_status is not None:
            self.payload['upstream_status'] = upstream_status
        if retry_after is not None:
            self.payload['retry_after'] = retry_after


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, request, file, code, message, headers, url):
        return None


class RoutedHTTPSConnection(HTTPSConnection):
    """Use Compose networking while preserving the URL's TLS name and Host."""

    def __init__(self, host, *, route, **kwargs):
        super().__init__(host, **kwargs)
        self.route = route

    def connect(self):
        if self._tunnel_host:
            raise OSError('Proxy tunnels are not supported by the public API tester.')
        raw_socket = socket.create_connection(self.route, self.timeout, self.source_address)
        try:
            self.sock = self._context.wrap_socket(raw_socket, server_hostname=self.host)
        except BaseException:
            raw_socket.close()
            raise


class RoutedHTTPSHandler(HTTPSHandler):
    def __init__(self, *, context, route):
        super().__init__(context=context)
        self.route = route

    def https_open(self, request):
        def connection(host, **kwargs):
            return RoutedHTTPSConnection(host, route=self.route, **kwargs)
        return self.do_open(connection, request, context=self._context)


class Sessions:
    def __init__(self):
        self.entries = {}
        self.lock = threading.Lock()

    def _prune(self):
        now = time.monotonic()
        for token in list(self.entries):
            entry = self.entries[token]
            if entry['expires'] <= now and not entry['demo'].lock.locked():
                entry['key'] = None
                if entry['demo'].recipe_id is None and not entry['demo'].uncertain:
                    del self.entries[token]

    def create(self, key):
        with self.lock:
            self._prune()
            if len(self.entries) >= MAX_SESSIONS:
                available = [token for token, entry in self.entries.items() if not entry['demo'].lock.locked()]
                if not available:
                    raise DemoError(503, 'The local connector is busy. Try connecting again shortly.')
                oldest = min(available, key=lambda token: (
                    self.entries[token]['demo'].recipe_id is not None,
                    self.entries[token]['expires'],
                ))
                del self.entries[oldest]
            token = secrets.token_urlsafe(32)
            self.entries[token] = {'key': key, 'expires': time.monotonic() + SESSION_TTL, 'demo': DemoState()}
            return token

    def entry(self, token):
        with self.lock:
            self._prune()
            return self.entries.get(token)

    def key(self, token):
        entry = self.entry(token)
        return entry.get('key') if entry and entry['expires'] > time.monotonic() else None

    def replace(self, token, key):
        with self.lock:
            entry = self.entries.get(token)
            if entry is None:
                raise DemoError(401, 'Connect your Recipe Site key first.')
            entry['key'] = key
            entry['expires'] = time.monotonic() + SESSION_TTL

    def remove(self, token, *, expected_key=None):
        # Forget credentials while retaining the temporary recipe for staff cleanup.
        with self.lock:
            entry = self.entries.get(token)
            if entry and (expected_key is None or entry['key'] == expected_key):
                entry['key'] = None


def evidence_body(value, depth=0):
    """Show response fields without credentials, account identities or raw HTML."""
    if depth > 7:
        return '[omitted]'
    if isinstance(value, dict):
        allowed = {
            'id', 'title', 'description', 'content_revision', 'approved', 'deletion_requested',
            'ingredients', 'categories', 'steps', 'images', 'name', 'quantity', 'unit',
            'step_number', 'instruction', 'image', 'error', 'detail', 'code',
            'non_field_errors', 'retained_image_ids', 'resubmit',
        }
        return {name: evidence_body(item, depth + 1) for name, item in value.items() if name in allowed}
    if isinstance(value, list):
        return [evidence_body(item, depth + 1) for item in value[:100]]
    if isinstance(value, str):
        return KEY_PATTERN.sub('[redacted API key]', value)[:4000]
    return value if value is None or type(value) in (bool, int, float) else '[omitted]'


def demo_recipe(data, expected_id):
    if (not isinstance(data, dict) or type(data.get('id')) is not int or data['id'] != expected_id
            or not isinstance(data.get('title'), str) or not data['title'].strip()
            or type(data.get('content_revision')) is not int or data['content_revision'] < 1
            or type(data.get('approved')) is not bool
            or type(data.get('deletion_requested')) is not bool):
        raise DemoError(502, 'The demo response could not be read. Read the recipe again before changing it.')
    return evidence_body(data)


def recipe_upload(photo, content_type):
    boundary = 'publicapitester' + secrets.token_hex(24)
    extension = {'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp'}[content_type]
    fields = {
        'title': DEMO_TITLE,
        'description': 'Temporary recipe created through the public API demonstration.',
        'ingredients': json.dumps([{'name': 'rice', 'quantity': '100', 'unit': 'g'}]),
        'categories': '[]',
        'steps': json.dumps([{'step_number': 1, 'instruction': 'Prepare the rice for this API demonstration.'}]),
    }
    parts = []
    for name, value in fields.items():
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
    parts.append((f'--{boundary}\r\nContent-Disposition: form-data; name="images"; filename="demo-photo{extension}"\r\n'
                  f'Content-Type: {content_type}\r\n\r\n').encode() + photo + b'\r\n')
    parts.append(f'--{boundary}--\r\n'.encode())
    return b''.join(parts), f'multipart/form-data; boundary={boundary}'


class DemoServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, port, api_base, context, *, bind='127.0.0.1', upstream=None):
        super().__init__((bind, port), Handler)
        self.api_base = api_base
        parsed = urlsplit(api_base)
        self.api_origin = f'{parsed.scheme}://{parsed.netloc}'
        https_handler = (RoutedHTTPSHandler(context=context, route=upstream)
                         if upstream else HTTPSHandler(context=context))
        self.opener = build_opener(ProxyHandler({}), NoRedirects(), https_handler)
        self.sessions = Sessions()

    def request_api(self, key, path, *, method='GET', data=None, content_type=None):
        headers = {'Authorization': f'ApiKey {key}', 'Accept': 'application/json'}
        if content_type:
            headers['Content-Type'] = content_type
        request = Request(self.api_base + path, headers=headers, data=data, method=method)
        try:
            try:
                response = self.opener.open(request, timeout=15)
            except HTTPError as error:
                response = error
            with response:
                status = response.code
                wait = response.headers.get('Retry-After', '60')
                seconds = min(3600, max(1, int(wait))) if wait.isdecimal() else 60
                raw = response.read(MAX_RESPONSE + 1)
                if len(raw) > MAX_RESPONSE:
                    raise DemoError(502, 'The recipe response is too large for this demo.')
                if status == 204:
                    return status, None, None
                if response.headers.get_content_type() != 'application/json':
                    if status >= 300:
                        return status, {'error': 'Recipe Site returned a non-JSON error response.'}, seconds if status == 429 else None
                    raise DemoError(502, 'Recipe Site returned an unexpected response.')
                return status, json.loads(raw), seconds if status == 429 else None
        except URLError as error:
            if isinstance(error.reason, ssl.SSLCertVerificationError):
                raise DemoError(502, 'HTTPS verification failed. Use Recipe Site\'s rootCA.pem with --ca.')
            raise DemoError(502, 'Cannot reach Recipe Site. Keep the recipe website running and try again.')
        except (TimeoutError, OSError):
            raise DemoError(502, 'Recipe Site did not respond. Keep it running and try again.')
        except (ValueError, UnicodeError):
            raise DemoError(502, 'Recipe Site returned unreadable JSON data.')

    def upstream(self, key, path):
        status, data, retry_after = self.request_api(key, path)
        if status == 200:
            return data
        if status == 429:
            raise DemoError(429, 'Recipe Site request limit reached. Please wait before loading again.', status, retry_after)
        messages = {
            401: 'Recipe Site rejected this key. Check that it is active and copied in full.',
            403: 'This API key cannot read the requested recipe.',
            404: 'This recipe or page is no longer available.',
        }
        raise DemoError(status if status in messages else 502,
                        messages.get(status, 'Recipe Site returned an unexpected response. Redirects are not followed.'), status)

class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(20)

    # Avoid recording cookies, headers, request bodies or user-controlled URLs.
    def log_message(self, format, *args):
        pass

    def send_data(self, status, data, *, content_type='application/json; charset=utf-8', cookie=None):
        if isinstance(data, (dict, list)):
            data = json.dumps(data, ensure_ascii=False, allow_nan=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Content-Security-Policy',
                         "default-src 'self'; script-src 'self'; style-src 'self'; "
                         f"img-src 'self' {self.server.api_origin}; connect-src 'self'; "
                         "base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
        if cookie is not None:
            self.send_header('Set-Cookie', cookie)
        if status == 429 and isinstance(data, bytes):
            self.send_header('Retry-After', str(self.retry_after or 60))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(data)

    def session_id(self):
        try:
            cookies = SimpleCookie()
            cookies.load(self.headers.get('Cookie', ''))
            return cookies[COOKIE].value if COOKIE in cookies else ''
        except Exception:
            return ''

    @staticmethod
    def cookie(token=''):
        return f'{COOKIE}={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={SESSION_TTL if token else 0}'

    def check_request(self, *, api=False):
        hosts = self.headers.get_all('Host', [])
        expected = {f'localhost:{self.server.server_port}', f'127.0.0.1:{self.server.server_port}'}
        if len(hosts) != 1 or hosts[0] not in expected:
            raise DemoError(403, 'Open this demo through its localhost address.')
        if api:
            origin = self.headers.get('Origin')
            if (self.headers.get('X-Public-API-Tester') != '1'
                    or (origin is not None and origin != 'http://' + hosts[0])
                    or self.headers.get('Sec-Fetch-Site', 'same-origin') not in ('same-origin', 'none')):
                raise DemoError(403, 'Requests must come from this public API tester.')

    def read_json(self):
        if self.headers.get_content_type() != 'application/json' or self.headers.get('Transfer-Encoding'):
            raise DemoError(400, 'Send a small JSON object.')
        length = self.headers.get('Content-Length', '')
        if not length.isdecimal() or not 0 < int(length) <= 4096:
            raise DemoError(400, 'Send a small JSON object.')
        try:
            data = json.loads(self.rfile.read(int(length)))
        except (ValueError, UnicodeError):
            raise DemoError(400, 'The request could not be read.')
        if not isinstance(data, dict):
            raise DemoError(400, 'Send a JSON object.')
        return data

    def read_photo(self):
        content_type = self.headers.get('Content-Type', '')
        length = self.headers.get('Content-Length', '')
        if (self.headers.get_content_type() != 'multipart/form-data'
                or self.headers.get('Transfer-Encoding') or len(content_type) > 512
                or '\r' in content_type or '\n' in content_type
                or not length.isdecimal() or not 0 < int(length) <= MAX_PHOTO + 16384):
            raise DemoError(400, 'Choose one JPEG, PNG, GIF or WebP photo, up to 5 MiB.')
        raw = self.rfile.read(int(length))
        if len(raw) != int(length):
            raise DemoError(400, 'The photo upload was incomplete.')
        message = BytesParser(policy=policy.default).parsebytes(
            b'MIME-Version: 1.0\r\nContent-Type: ' + content_type.encode('ascii') + b'\r\n\r\n' + raw)
        if not message.is_multipart() or message.defects:
            raise DemoError(400, 'The photo upload could not be read.')
        parts = list(message.iter_parts())
        if len(parts) != 1:
            raise DemoError(400, 'Choose exactly one photo for the demo recipe.')
        part = parts[0]
        if (part.is_multipart() or part.defects or part.get_content_disposition() != 'form-data'
                or part.get_param('name', header='content-disposition') != 'images'
                or part.get_content_type() not in ('image/jpeg', 'image/png', 'image/gif', 'image/webp')):
            raise DemoError(400, 'Choose one JPEG, PNG, GIF or WebP photo.')
        photo = part.get_payload(decode=True)
        if not isinstance(photo, bytes) or not 0 < len(photo) <= MAX_PHOTO:
            raise DemoError(400, 'The photo must be nonempty and at most 5 MiB.')
        return recipe_upload(photo, part.get_content_type())

    def handle_demo(self, method, path):
        token = self.session_id()
        entry = self.server.sessions.entry(token)
        key = self.server.sessions.key(token)
        if method == 'GET' and path == '/api/demo':
            demo = entry['demo'] if entry else DemoState()
            self.send_data(200, demo.payload(connected=key is not None))
            return
        if entry is None or key is None:
            raise DemoError(401, 'Connect your Recipe Site key first. Any tracked demo recipe can be resumed after reconnecting.')
        demo = entry['demo']
        if not demo.lock.acquire(blocking=False):
            raise DemoError(409, 'A demo request is already running. Wait, then reload demo status.')
        try:
            key = self.server.sessions.key(token)
            if key is None:
                raise DemoError(401, 'Reconnect an active API key before continuing this demo.')
            body = None
            content_type = None
            if method == 'POST' and path == '/api/demo':
                if demo.uncertain or (demo.recipe_id is not None and not demo.deleted):
                    raise DemoError(409, 'Finish or clean up the existing demo recipe before creating another.')
                body, content_type = self.read_photo()
                upstream_path = '/recipes/'
                # An uncertain new create must never reconcile against a previously deleted ID.
                demo.recipe_id = None
                demo.recipe = None
                demo.deleted = False
            elif path == '/api/demo/recipe' and method in ('GET', 'PUT', 'DELETE'):
                if demo.recipe_id is None:
                    raise DemoError(409, 'Create the demo recipe first. If a previous create had an unknown result, check your Recipe Site profile.')
                upstream_path = f'/recipes/{demo.recipe_id}/'
                if method != 'GET':
                    if demo.deleted or demo.uncertain:
                        raise DemoError(409, 'Read the tracked recipe again before changing it.')
                    data = self.read_json()
                    if method == 'PUT':
                        title = data.get('title')
                        if set(data) != {'title'} or not isinstance(title, str) or not 1 <= len(title.strip()) <= 100:
                            raise DemoError(400, 'Use a title containing 1 to 100 characters.')
                        revision = (demo.recipe or {}).get('content_revision')
                        if type(revision) is not int or revision < 1:
                            raise DemoError(409, 'Read the tracked recipe again to get its current revision.')
                        body = json.dumps({'title': title.strip(), 'content_revision': revision}).encode()
                        content_type = 'application/json'
                    elif data:
                        raise DemoError(400, 'Delete does not accept extra fields.')
            else:
                raise DemoError(405, 'This demo supports create, read, rename and delete for its temporary recipe only.')

            demo.evidence = None
            if method != 'GET':
                demo.uncertain = True
            status, response, retry_after = self.server.request_api(
                key, upstream_path, method=method, data=body, content_type=content_type)
            demo.evidence = {
                'method': method, 'path': '/api/public/v1' + upstream_path,
                'status': status, 'body': evidence_body(response),
            }
            if method == 'POST' and status == 201:
                recipe_id = response.get('id') if isinstance(response, dict) else None
                if type(recipe_id) is int and recipe_id > 0:
                    # Retain the ID even if another response field cannot be read.
                    demo.recipe_id = recipe_id
                    demo.deleted = False
                    demo.recipe = {'id': recipe_id, 'title': DEMO_TITLE}
                    demo.recipe = demo_recipe(response, recipe_id)
                    demo.uncertain = False
                else:
                    raise DemoError(502, 'Recipe creation returned no usable ID. Check your Recipe Site profile before retrying.')
            elif method in ('GET', 'PUT') and status == 200:
                demo.recipe = demo_recipe(response, demo.recipe_id)
                demo.deleted = False
                demo.uncertain = False
            elif method == 'DELETE' and status == 202:
                if (not isinstance(response, dict) or response.get('id') != demo.recipe_id
                        or response.get('deletion_requested') is not True):
                    raise DemoError(502, 'Read the demo recipe again to check whether deletion was requested.')
                demo.recipe = {**(demo.recipe or {}), **evidence_body(response)}
                demo.uncertain = False
            elif (method == 'DELETE' and status == 204) or (method == 'GET' and status == 404):
                demo.recipe = None
                demo.deleted = True
                demo.uncertain = False
            elif method != 'GET' and 400 <= status < 500:
                demo.uncertain = False

            payload = {**demo.payload(connected=True), 'busy': False}
            if status >= 300:
                messages = {
                    400: 'Recipe Site rejected the recipe fields or photo. See its response below.',
                    401: 'Recipe Site rejected this key. Reconnect with an active key; the demo recipe is still tracked.',
                    403: 'This account or API key does not have permission for that action.',
                    404: 'Recipe Site could not find the tracked demo recipe.',
                    409: 'The recipe changed or cannot be edited now. Read it again and check the response.',
                    429: 'Recipe Site request limit reached. Wait before trying again.',
                }
                payload.update(error=messages.get(status, 'Recipe Site could not complete the request.'), upstream_status=status)
                if status == 401:
                    self.server.sessions.remove(token)
                    payload['connected'] = False
                if retry_after:
                    payload['retry_after'] = retry_after
                    self.retry_after = retry_after
            # A source 204 still needs a local JSON body carrying its evidence.
            self.send_data(status if 400 <= status < 600 else 200, payload)
        except DemoError as error:
            error.payload.update({**demo.payload(connected=self.server.sessions.key(token) is not None), 'busy': False})
            raise
        finally:
            demo.lock.release()

    def run_request(self, method):
        self.retry_after = None
        expire_cookie = False
        try:
            parsed = urlsplit(self.path)
            is_api = parsed.path.startswith('/api/')
            self.check_request(api=is_api)
            if not is_api:
                assets = {'/': ('index.html', 'text/html'), '/index.html': ('index.html', 'text/html'),
                          '/app.js': ('app.js', 'text/javascript'), '/api-demo.js': ('api-demo.js', 'text/javascript'),
                          '/styles.css': ('styles.css', 'text/css')}
                if method != 'GET' or parsed.path not in assets or parsed.query:
                    raise DemoError(404, 'Page not found.')
                name, content_type = assets[parsed.path]
                self.send_data(200, (ROOT / name).read_bytes(), content_type=content_type + '; charset=utf-8')
                return
            if method == 'GET' and parsed.path == '/api/status' and not parsed.query:
                connected = self.server.sessions.key(self.session_id()) is not None
                self.send_data(200, {'connected': connected, 'api_base': self.server.api_base})
                return
            if method == 'POST' and parsed.path in ('/api/connect', '/api/disconnect') and not parsed.query:
                token = self.session_id()
                entry = self.server.sessions.entry(token)
                lock = entry['demo'].lock if entry else threading.Lock()
                if not lock.acquire(blocking=False):
                    raise DemoError(409, 'Wait for the demo request to finish before changing the connection.')
                try:
                    self.server.sessions.remove(token)
                    expire_cookie = entry is None
                    data = self.read_json()
                    if parsed.path == '/api/disconnect':
                        if data:
                            raise DemoError(400, 'Disconnect does not accept extra fields.')
                        self.send_data(200, {'connected': False}, cookie=self.cookie(token if entry else ''))
                        return
                    key = data.get('api_key')
                    if set(data) != {'api_key'} or not isinstance(key, str) or not KEY_PATTERN.fullmatch(key):
                        raise DemoError(400, 'Paste a complete Recipe Site API key.')
                    self.server.upstream(key, '/recipes/?page=1&page_size=1')
                    if entry:
                        self.server.sessions.replace(token, key)
                    else:
                        token = self.server.sessions.create(key)
                    self.send_data(200, {'connected': True, 'api_base': self.server.api_base, 'upstream_status': 200}, cookie=self.cookie(token))
                finally:
                    lock.release()
                return
            if parsed.path in ('/api/demo', '/api/demo/recipe') and not parsed.query:
                self.handle_demo(method, parsed.path)
                return
            raise DemoError(404, 'Demo endpoint not found.')
        except DemoError as error:
            if error.status == 401:
                expire_cookie = self.server.sessions.entry(self.session_id()) is None
            self.retry_after = error.payload.get('retry_after')
            self.send_data(error.status, error.payload, cookie=self.cookie() if expire_cookie else None)
        except (BrokenPipeError, ConnectionResetError):
            return
        except (OSError, ValueError):
            self.send_data(500, {'error': 'The local demo could not complete the request.'},
                           cookie=self.cookie() if expire_cookie else None)

    def do_GET(self):
        self.run_request('GET')

    def do_POST(self):
        self.run_request('POST')

    def do_PUT(self):
        self.run_request('PUT')

    def do_DELETE(self):
        self.run_request('DELETE')

    def do_HEAD(self):
        self.run_request('HEAD')

    def do_OPTIONS(self):
        self.run_request('OPTIONS')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--bind', choices=('127.0.0.1', '0.0.0.0'), default='127.0.0.1')
    parser.add_argument('--upstream', help='Internal HTTPS socket destination HOST:PORT; TLS still verifies the API hostname.')
    parser.add_argument('--api-base', default='https://localhost:8443/api/public/v1')
    ca_root = Path(os.environ.get('CAROOT') or Path(os.environ.get('XDG_DATA_HOME') or Path.home() / '.local/share') / 'mkcert')
    parser.add_argument('--ca', type=Path, default=ca_root / 'rootCA.pem')
    args = parser.parse_args()
    parsed = urlsplit(args.api_base)
    if (not 1 <= args.port <= 65535 or parsed.scheme != 'https'
            or not parsed.hostname or not re.fullmatch(r'[A-Za-z0-9.-]+', parsed.hostname)
            or parsed.username is not None or parsed.password is not None
            or parsed.query or parsed.fragment or parsed.path.rstrip('/') != '/api/public/v1'):
        parser.error('Use a valid local port and an HTTPS API base ending in /api/public/v1.')
    try:
        upstream = None
        if args.upstream:
            host, separator, port = args.upstream.rpartition(':')
            if (not separator or not re.fullmatch(r'[A-Za-z0-9.-]+', host)
                    or not port.isdecimal() or not 1 <= int(port) <= 65535):
                parser.error('--upstream must be HOST:PORT with a valid port.')
            upstream = (host, int(port))
        api_port = parsed.port
        origin = 'https://' + parsed.hostname + (f':{api_port}' if api_port is not None else '')
        context = ssl.create_default_context(cafile=str(args.ca.expanduser()))
        server = DemoServer(args.port, origin + '/api/public/v1', context, bind=args.bind, upstream=upstream)
    except (ValueError, OSError) as error:
        parser.exit(1, f'Cannot start the public API tester: {error}\nUse --ca /path/to/rootCA.pem or --port NUMBER if needed.\n')
    print(f'Public API Tester: http://localhost:{args.port}')
    print(f'Recipe API: {server.api_base}')
    print('Keys stay in memory. Press Ctrl+C to stop the demo and forget its connections.')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
