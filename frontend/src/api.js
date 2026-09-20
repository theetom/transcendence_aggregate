export async function requestJson(url, options) {
  const response = await fetch(url, options)
  if (!response.ok) {
    const body = await response.text()
    const error = new Error(`HTTP ${response.status} ${response.statusText}: ${body}`)
    error.response = {
      url,
      method: options?.method ?? 'GET',
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get('Content-Type') ?? '',
      body,
    }
    throw error
  }
  return response.json()
}
