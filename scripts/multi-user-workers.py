"""Inspect or temporarily adjust this container's Gunicorn worker count.

Run through the existing backend container, for example:
docker compose exec -T backend python - status < scripts/multi-user-workers.py
Use `three` to enable three workers, or `one` to restore an original count of one.
This script does not read environment secrets, import Django, or touch the database.
"""

import json
import os
from pathlib import Path
import signal
import sys
import time


def processes():
    found = {}
    for directory in Path('/proc').iterdir():
        if not directory.name.isdigit():
            continue
        try:
            arguments = (directory / 'cmdline').read_bytes().split(b'\0')
            executable = arguments[0].rsplit(b'/', 1)[-1]
            if executable == b'gunicorn':
                server_arguments = arguments[1:]
            elif executable.startswith(b'python'):
                if len(arguments) > 1 and arguments[1].rsplit(b'/', 1)[-1] == b'gunicorn':
                    server_arguments = arguments[2:]
                elif arguments[1:3] == [b'-m', b'gunicorn']:
                    server_arguments = arguments[3:]
                else:
                    continue
            else:
                # Init and shell arguments may contain the entire Gunicorn command.
                continue
            if b'config.wsgi:application' not in server_arguments:
                continue
            parent_line = next(
                line for line in (directory / 'status').read_text().splitlines()
                if line.startswith('PPid:')
            )
            found[int(directory.name)] = int(parent_line.split()[1])
        except (FileNotFoundError, ProcessLookupError):
            continue
    return found


def inspect():
    found = processes()
    masters = [pid for pid, parent in found.items() if parent not in found]
    if len(masters) != 1:
        raise RuntimeError('Expected exactly one Gunicorn master; no signals sent.')
    master = masters[0]
    if master != 1 and found[master] != 1:
        raise RuntimeError('Unexpected Gunicorn parent process; no signals sent.')
    workers = sorted(pid for pid, parent in found.items() if parent == master)
    if not workers:
        raise RuntimeError('No Gunicorn workers found; wait for startup and retry.')
    return master, workers


def report(master, workers):
    print(json.dumps({'master_pid': master, 'worker_count': len(workers), 'worker_pids': workers}))


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in {'status', 'three', 'one'}:
        raise RuntimeError('Choose status, three, or one.')
    mode = sys.argv[1]
    master, workers = inspect()
    report(master, workers)
    if mode == 'status':
        return
    target = 3 if mode == 'three' else 1
    if not 1 <= len(workers) <= 3:
        raise RuntimeError('Worker count is outside the expected 1–3 range; no signals sent.')
    if mode == 'three' and len(workers) not in {1, 3}:
        raise RuntimeError('Expected one worker before enabling this test, or three already running; no signals sent.')

    while len(workers) != target:
        before = len(workers)
        fresh_master, fresh_workers = inspect()
        if fresh_master != master or len(fresh_workers) != before:
            raise RuntimeError('Gunicorn changed during inspection; stop and inspect again.')
        step = 1 if before < target else -1
        os.kill(master, signal.SIGTTIN if step == 1 else signal.SIGTTOU)
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            time.sleep(0.2)
            fresh_master, workers = inspect()
            if fresh_master != master:
                raise RuntimeError('Gunicorn restarted during the adjustment; inspect again.')
            if len(workers) == before + step:
                report(master, workers)
                break
            if len(workers) != before:
                raise RuntimeError('Unexpected worker-count change; inspect before continuing.')
        else:
            raise RuntimeError('Timed out waiting for workers. Count may have changed; run status.')


if __name__ == '__main__':
    try:
        main()
    except (OSError, RuntimeError, StopIteration) as error:
        print(f'STOP: {error}', file=sys.stderr)
        sys.exit(1)
