import { authTokenStorageKey } from './siteData'

// Proposed API contract: see docs/staff-api.md. The backend partner owns these APIs.
const submissionsPath = '/api/staff/submissions/'
const invalidDataMessage = 'Submission data could not be read. Please try again later.'

async function requestStaffApi(path, options = {}) {
  const token = window.sessionStorage.getItem(authTokenStorageKey)
  if (!token) {
    throw new Error('Sign in with a staff account to continue.')
  }

  let response
  try {
    response = await fetch(path, {
      ...options,
      headers: {
        Authorization: `Token ${token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
    })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new Error('Unable to reach submissions. Check your connection and try again.')
  }

  if (!response.ok) {
    const messages = {
      400: 'The decision could not be saved. Check your feedback and try again.',
      401: 'Your session has expired. Sign in again with a staff account.',
      403: 'Only staff accounts can review submissions.',
      404: 'The requested submissions are unavailable right now.',
      409: 'This submission has already been reviewed. Its latest status will be loaded.',
    }
    throw Object.assign(new Error(messages[response.status] || 'Unable to complete the request. Please try again later.'), {
      status: response.status,
    })
  }

  return response.json().catch(() => {
    throw new Error(invalidDataMessage)
  })
}

function readSubmission(data, withDetails = false) {
  if (!Number.isInteger(data?.id) || data.id < 1
    || typeof data.title !== 'string' || !data.title.trim()
    || typeof data.author !== 'string' || typeof data.description !== 'string'
    || typeof data.date_created !== 'string'
    || Number.isNaN(Date.parse(`${data.date_created.split('T')[0]}T12:00:00`))
    || !['pending', 'approved', 'rejected'].includes(data.status)
    || typeof data.feedback !== 'string') {
    throw new Error(invalidDataMessage)
  }

  if (withDetails && (!Array.isArray(data.ingredients) || !Array.isArray(data.steps)
    || data.ingredients.some((item) => typeof item?.name !== 'string'
      || typeof item.quantity !== 'string' || typeof item.unit !== 'string')
    || data.steps.some((item) => !Number.isInteger(item?.step_number)
      || item.step_number < 1 || typeof item.instruction !== 'string'))) {
    throw new Error(invalidDataMessage)
  }

  return data
}

export async function getPendingSubmissions(signal) {
  const data = await requestStaffApi(`${submissionsPath}?status=pending`, { signal })
  if (!Array.isArray(data)) throw new Error(invalidDataMessage)
  return data.map((item) => readSubmission(item)).filter((item) => item.status === 'pending')
}

export async function getSubmission(submissionId, signal) {
  const data = readSubmission(await requestStaffApi(`${submissionsPath}${encodeURIComponent(submissionId)}/`, { signal }), true)
  if (String(data.id) !== submissionId) throw new Error(invalidDataMessage)
  return data
}

export async function saveSubmissionDecision(submissionId, status, feedback) {
  const data = readSubmission(await requestStaffApi(`${submissionsPath}${encodeURIComponent(submissionId)}/decision/`, {
    method: 'POST',
    body: JSON.stringify({ status, feedback }),
  }), true)
  if (String(data.id) !== submissionId || data.status !== status) {
    throw new Error('The saved decision could not be confirmed. Reload the submission before trying again.')
  }
  return data
}
