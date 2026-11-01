import { readRecipeSummary, requestRecipeApi } from './recipeApi'

const invalidProfileMessage = 'Public profile data could not be read. Reload and try again.'

function readUserId(value) {
  const id = typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : value
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new Error('Choose a valid user profile to open.')
  }
  return id
}

export function getUserProfilePath(userId) {
  return `/users/${readUserId(userId)}`
}

function readPublicProfile(data) {
  if (!Number.isSafeInteger(data?.id) || data.id < 1
    || !Number.isSafeInteger(data.user?.id) || data.user.id < 1
    || typeof data.user.username !== 'string' || !data.user.username.trim()
    || typeof data.user.first_name !== 'string' || typeof data.user.last_name !== 'string'
    || typeof data.user.email !== 'string' || typeof data.bio !== 'string'
    || (data.profile_picture !== null && typeof data.profile_picture !== 'string')) {
    throw new Error(invalidProfileMessage)
  }
  return data
}

async function requestUserApi(path, signal) {
  try {
    return await requestRecipeApi(path, { signal })
  } catch (error) {
    if (error.status === 404) error.message = 'This user profile could not be found.'
    if (error.status === 403) error.message = 'This user profile is unavailable.'
    throw error
  }
}

export async function getPublicUsers(signal) {
  const data = await requestUserApi('/api/users/', signal)
  if (!Array.isArray(data)) throw new Error(invalidProfileMessage)
  const profiles = data.map(readPublicProfile)
  if (new Set(profiles.map((profile) => profile.user.id)).size !== profiles.length) {
    throw new Error(invalidProfileMessage)
  }
  return profiles
}

export async function getPublicProfile(userId, signal) {
  const id = readUserId(userId)
  const profile = readPublicProfile(await requestUserApi(`/api/users/id/${id}/`, signal))
  if (profile.user.id !== id || !Array.isArray(profile.approved_recipes)) {
    throw new Error(invalidProfileMessage)
  }
  const recipes = profile.approved_recipes.map(readRecipeSummary)
  if (recipes.some((recipe) => !recipe.approved)
    || new Set(recipes.map((recipe) => recipe.id)).size !== recipes.length) {
    throw new Error(invalidProfileMessage)
  }
  return profile
}
