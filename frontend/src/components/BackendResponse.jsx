import { useEffect, useState } from 'react'
import { getAuthToken } from '../auth'

// Render the response even when Django has no route for this URL. In particular,
// an HTML 404 is not replaced with a frontend-written feature notice.
function BackendResponse({ url, method = 'GET' }) {
  return <ResponseForUrl key={`${method} ${url}`} url={url} method={method} />
}

function ResponseForUrl({ url, method }) {
  const [response, setResponse] = useState(null)
  const [networkError, setNetworkError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const token = getAuthToken()

    async function loadResponse() {
      try {
        const result = await fetch(url, {
          method,
          signal: controller.signal,
          headers: token ? { Authorization: `Token ${token}` } : {},
        })
        const body = await result.text()
        if (!controller.signal.aborted) {
          setResponse({
            url,
            method,
            status: result.status,
            statusText: result.statusText,
            contentType: result.headers.get('Content-Type') ?? '',
            body,
          })
        }
      } catch (error) {
        if (!controller.signal.aborted) setNetworkError(error.message)
      }
    }

    loadResponse()
    return () => controller.abort()
  }, [url, method])

  if (networkError) return <p className="empty-state" role="alert">{networkError}</p>
  if (!response) return <p role="status">Loading…</p>

  return <HttpResponse response={response} />
}

export function BackendError({ error }) {
  if (error.response) return <HttpResponse response={error.response} />
  return <p className="empty-state" role="alert">{error.message}</p>
}

function HttpResponse({ response }) {
  return (
    <div>
      <p role={response.status >= 400 ? 'alert' : 'status'}>
        {response.method} {response.url} — HTTP {response.status} {response.statusText}
      </p>
      {response.contentType.includes('text/html') ? (
        <iframe
          title={`Backend response for ${response.url}`}
          srcDoc={response.body}
          sandbox=""
          width="100%"
          height="600"
        />
      ) : (
        <pre>{response.body}</pre>
      )}
    </div>
  )
}

export default BackendResponse
