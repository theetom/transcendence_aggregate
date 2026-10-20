import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import RecipePreviewCard from '../components/RecipePreviewCard'
import { getCurrentProfile, getRecipeDetails, readRecipeSummary, requestRecipeApi, updateCurrentProfile } from '../data/recipeApi'
import { formatDate } from '../data/siteData'

const recipePreviewLimit = 3
const profilePhotoTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const maxProfilePhotoSize = 5 * 1024 * 1024

function profilePhotoError(file) {
  if (!file) return ''
  if (!profilePhotoTypes.includes(file.type) || file.size === 0) {
    return 'Choose a nonempty JPEG, PNG, GIF or WebP photo.'
  }
  return file.size > maxProfilePhotoSize ? 'The photo must be 5 MiB or smaller.' : ''
}

function profileErrorMessage(value) {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(profileErrorMessage).filter(Boolean).join(' ')
  if (value && typeof value === 'object') return Object.values(value).map(profileErrorMessage).filter(Boolean).join(' ')
  return ''
}

function ProfileFieldError({ field, message }) {
  return message ? (
    <p id={`profile-${field}-error`} className="status-banner signup-field-error" role="alert">
      {message}
    </p>
  ) : null
}

function ProfileEditor({ profile, onSaved, onCancel }) {
  const [draft, setDraft] = useState({
    first_name: profile.user.first_name ?? '',
    last_name: profile.user.last_name ?? '',
    bio: profile.bio ?? '',
  })
  const [pictureFile, setPictureFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [failedPreviewUrl, setFailedPreviewUrl] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [saveStatus, setSaveStatus] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const saving = useRef(false)
  const mounted = useRef(false)
  const saveController = useRef(null)
  const pictureInput = useRef(null)
  const firstNameInput = useRef(null)
  const previewFailed = Boolean(previewUrl) && failedPreviewUrl === previewUrl
  const pictureError = fieldErrors.profile_picture
    || (previewFailed ? 'The photo preview could not be loaded. Choose another image.' : '')

  useEffect(() => {
    mounted.current = true
    firstNameInput.current?.focus()
    return () => {
      mounted.current = false
      saveController.current?.abort()
    }
  }, [])

  useEffect(() => {
    if (!pictureFile || profilePhotoError(pictureFile)) {
      setPreviewUrl('')
      return undefined
    }
    const url = URL.createObjectURL(pictureFile)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [pictureFile])

  function updateDraft(field, value) {
    if (saving.current) return
    setDraft((current) => ({ ...current, [field]: value }))
    setFieldErrors((current) => ({ ...current, [field]: '' }))
    setSaveStatus('')
  }

  function choosePicture(event) {
    if (saving.current) return
    const file = event.target.files?.[0] ?? null
    const message = profilePhotoError(file)
    setPictureFile(file)
    setFieldErrors((current) => ({ ...current, profile_picture: message }))
    setSaveStatus('')
  }

  function clearPicture() {
    if (saving.current) return
    setPictureFile(null)
    if (pictureInput.current) pictureInput.current.value = ''
    setFieldErrors((current) => ({ ...current, profile_picture: '' }))
    setSaveStatus('')
  }

  async function handleSave(event) {
    event.preventDefault()
    if (saving.current) return
    const errors = {}
    for (const field of ['first_name', 'last_name']) {
      if (draft[field].length > 150) errors[field] = 'Use 150 characters or fewer.'
    }
    const photoError = profilePhotoError(pictureFile)
      || (pictureFile && previewFailed ? 'Choose a photo your browser can display.' : '')
      || fieldErrors.profile_picture
    if (photoError) errors.profile_picture = photoError
    setFieldErrors(errors)
    setSaveStatus('')
    if (Object.keys(errors).length > 0) {
      document.getElementById(`profile-${Object.keys(errors)[0]}`)?.focus()
      return
    }

    const payload = new FormData()
    payload.append('first_name', draft.first_name.trim())
    payload.append('last_name', draft.last_name.trim())
    payload.append('bio', draft.bio)
    if (pictureFile) payload.append('profile_picture', pictureFile)
    const controller = new AbortController()
    saveController.current = controller
    saving.current = true
    setIsSaving(true)
    setSaveStatus('Saving profile...')

    try {
      const updatedProfile = await updateCurrentProfile(payload, controller.signal)
      if (!mounted.current || controller.signal.aborted) return
      if (!Number.isInteger(profile.user.id) || profile.user.id < 1
        || updatedProfile.user.id !== profile.user.id) {
        throw new Error('Your account details could not be confirmed. Reload your profile before editing again.')
      }
      onSaved(updatedProfile)
    } catch (error) {
      if (!mounted.current || controller.signal.aborted || error.name === 'AbortError') return
      const messages = {}
      for (const field of ['first_name', 'last_name', 'bio', 'profile_picture']) {
        messages[field] = profileErrorMessage(error.fieldErrors?.[field] ?? error.fieldErrors?.user?.[field])
      }
      setFieldErrors(messages)
      setSaveStatus(profileErrorMessage(error.fieldErrors?.non_field_errors)
        || error.message || 'Unable to save your profile. Try again.')
    } finally {
      saving.current = false
      saveController.current = null
      if (mounted.current && !controller.signal.aborted) setIsSaving(false)
    }
  }

  return (
    <form className="profile-page__editor" onSubmit={handleSave} noValidate aria-busy={isSaving}>
      <h3>Edit profile</h3>
      <fieldset className="profile-page__editor-fields" disabled={isSaving}>
        <legend className="sr-only">Your profile details</legend>
        {['first_name', 'last_name'].map((field) => (
          <div className="field" key={field}>
            <label htmlFor={`profile-${field}`}>{field === 'first_name' ? 'First name' : 'Last name'}</label>
            <input
              id={`profile-${field}`}
              ref={field === 'first_name' ? firstNameInput : null}
              type="text"
              autoComplete={field === 'first_name' ? 'given-name' : 'family-name'}
              maxLength={150}
              value={draft[field]}
              onChange={(event) => updateDraft(field, event.target.value)}
              aria-invalid={Boolean(fieldErrors[field])}
              aria-describedby={fieldErrors[field] ? `profile-${field}-error` : undefined}
            />
            <ProfileFieldError field={field} message={fieldErrors[field]} />
          </div>
        ))}
        <div className="field profile-page__editor-full">
          <label htmlFor="profile-bio">Bio</label>
          <textarea
            id="profile-bio"
            rows={4}
            value={draft.bio}
            onChange={(event) => updateDraft('bio', event.target.value)}
            aria-invalid={Boolean(fieldErrors.bio)}
            aria-describedby={fieldErrors.bio ? 'profile-bio-error' : undefined}
          />
          <ProfileFieldError field="bio" message={fieldErrors.bio} />
        </div>
        <div className="profile-page__editor-photo profile-page__editor-full">
          <div className="field">
            <label htmlFor="profile-profile_picture">Profile photo (optional)</label>
            <input
              id="profile-profile_picture"
              ref={pictureInput}
              type="file"
              accept={profilePhotoTypes.join(',')}
              onChange={choosePicture}
              aria-invalid={Boolean(pictureError)}
              aria-describedby={`profile-photo-help${pictureError ? ' profile-profile_picture-error' : ''}`}
            />
            <p id="profile-photo-help" className="profile-page__section-note">
              JPEG, PNG, GIF or WebP, up to 5 MiB. Without a new photo, your current picture stays unchanged.
            </p>
            <ProfileFieldError field="profile_picture" message={pictureError} />
            {pictureFile || fieldErrors.profile_picture ? (
              <button type="button" className="button button--ghost" onClick={clearPicture}>
                Clear selected photo
              </button>
            ) : null}
          </div>
          <div className="profile-page__picture-box profile-page__editor-preview">
            {previewUrl && !previewFailed ? (
              <img src={previewUrl} alt="Selected profile photo preview" onError={() => setFailedPreviewUrl(previewUrl)} />
            ) : (
              <p className="profile-page__section-note profile-page__picture-empty">
                {previewFailed ? 'Preview could not be loaded.' : 'No new photo selected.'}
              </p>
            )}
          </div>
        </div>
      </fieldset>
      {saveStatus ? <p className="status-banner" role={isSaving ? 'status' : 'alert'}>{saveStatus}</p> : null}
      <div className="profile-page__editor-actions">
        <button type="submit" className="button button--primary" disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save profile'}
        </button>
        <button type="button" className="button button--ghost" disabled={isSaving} onClick={() => {
          if (!saving.current) onCancel()
        }}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function ProfileRecipeList({ recipes, status, emptyMessage, compact = false }) {
  if (!recipes) {
    return (
      <p className="status-banner" role="status" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {status}
      </p>
    )
  }

  return (
    <>
      {recipes.length > 0 ? (
        <div className={`recipe-preview-grid${compact ? ' recipe-preview-grid--compact' : ' profile-page__recipe-grid'}`}>
          {recipes.map((recipe) => <RecipePreviewCard key={recipe.id} recipe={recipe} />)}
        </div>
      ) : (
        <p className="profile-page__section-note">{status || emptyMessage}</p>
      )}
      {recipes.length > 0 && status ? (
        <p className="profile-page__section-note" role="status">{status}</p>
      ) : null}
    </>
  )
}

function readProfileRecipes(data) {
  if (!Array.isArray(data)) {
    throw new Error('Your recipe list could not be read. Reload to try again.')
  }

  const recipes = data.map(readRecipeSummary)
  if (new Set(recipes.map((recipe) => recipe.id)).size !== recipes.length
    || recipes.some((recipe) =>
      ['ingredients', 'categories'].some((field) =>
        recipe[field] !== undefined && (
          !Array.isArray(recipe[field])
          || recipe[field].some((item) => typeof item?.name !== 'string')
        ),
      ),
    )) {
    throw new Error('Your recipe list could not be read. Reload to try again.')
  }

  return recipes
}

function ProfilePage({ showAllRecipes = false }) {
  const [profile, setProfile] = useState(null)
  const [status, setStatus] = useState('Loading profile...')
  const [recipes, setRecipes] = useState(null)
  const [recipeStatus, setRecipeStatus] = useState('Loading approved recipes...')
  const [favorites, setFavorites] = useState(null)
  const [favoriteStatus, setFavoriteStatus] = useState('Loading favorites...')
  const [pendingRecipes, setPendingRecipes] = useState(null)
  const [pendingStatus, setPendingStatus] = useState('Loading pending recipes...')
  const [rejectedRecipes, setRejectedRecipes] = useState(null)
  const [pictureFailed, setPictureFailed] = useState(false)
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [profileMessage, setProfileMessage] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    async function loadProfile() {
      let currentProfile
      try {
        currentProfile = await getCurrentProfile(controller.signal)
      } catch (error) {
        if (!controller.signal.aborted) setStatus(error.message)
        return
      }

      if (controller.signal.aborted) return
      setProfile(currentProfile)
      setStatus('')

      const needsApprovedLookup = currentProfile.submitted_recipes === undefined
      if (!needsApprovedLookup) {
        try {
          const submitted = readProfileRecipes(currentProfile.submitted_recipes)
          setRecipes(submitted.filter((recipe) => recipe.approved === true))
          setPendingRecipes(submitted.filter((recipe) => recipe.approved === false && recipe.rejected === false))
          setRejectedRecipes(submitted.filter((recipe) => recipe.rejected === true))
          setRecipeStatus('')
          setPendingStatus('')
        } catch (error) {
          setRecipeStatus(error.message)
          setPendingStatus(error.message)
        }
      } else {
        setPendingStatus('Your pending recipes are not available yet.')
      }

      let favoriteIds = null
      if (currentProfile.favorite_recipes !== undefined) {
        try {
          setFavorites(readProfileRecipes(currentProfile.favorite_recipes))
          setFavoriteStatus('')
        } catch (error) {
          setFavoriteStatus(error.message)
        }
      } else if (Array.isArray(currentProfile.favorites)
        && currentProfile.favorites.every((id) => Number.isInteger(id) && id > 0)) {
        if (currentProfile.favorites.length === 0) {
          setFavorites([])
          setFavoriteStatus('')
        } else {
          favoriteIds = currentProfile.favorites
        }
      } else {
        setFavoriteStatus('Your saved favorites are not available yet.')
      }

      if (!needsApprovedLookup && !favoriteIds) return

      let approvedSummaries
      try {
        approvedSummaries = readProfileRecipes(await requestRecipeApi('/api/recipes/all_recipes/', {
          signal: controller.signal,
          requiresAuth: true,
        }))
        if (approvedSummaries.some((recipe) => recipe.approved !== true)) {
          throw new Error('The approved recipe list could not be read. Reload to try again.')
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          if (needsApprovedLookup) setRecipeStatus(error.message)
          if (favoriteIds) setFavoriteStatus(error.message)
        }
        return
      }

      if (controller.signal.aborted) return
      if (favoriteIds) {
        const savedIds = new Set(favoriteIds)
        const availableFavorites = approvedSummaries.filter((recipe) => savedIds.has(recipe.id))
        setFavorites(availableFavorites)
        setFavoriteStatus(availableFavorites.length === savedIds.size
          ? ''
          : 'Some saved favorites are unavailable here.')
      }

      if (!needsApprovedLookup) return
      if (!Number.isInteger(currentProfile.user.id) || currentProfile.user.id < 1) {
        setRecipeStatus('Your account details could not be read. Reload to try again.')
        return
      }

      // Older profile responses omit submissions. Details identify the author
      // of each approved recipe; never use the admin pending list for this view.
      try {
        const details = await Promise.all(approvedSummaries.map(async (summary) => {
          const recipe = await getRecipeDetails(summary.id, controller.signal)
          if (recipe.id !== summary.id || !Number.isInteger(recipe.user) || recipe.user < 1) {
            throw new Error('Recipe ownership could not be confirmed. Reload to try again.')
          }
          return recipe
        }))
        if (controller.signal.aborted) return
        setRecipes(details.filter((recipe) =>
          recipe.user === currentProfile.user.id && recipe.approved === true,
        ))
        setRecipeStatus('')
      } catch (error) {
        if (!controller.signal.aborted) setRecipeStatus(error.message)
      }
    }

    loadProfile()
    return () => controller.abort()
  }, [])

  const joinedDate = typeof profile?.user.date_joined === 'string'
    ? profile.user.date_joined.split('T')[0]
    : null
  const pageLabel = showAllRecipes ? 'approved recipes' : 'profile'
  const pageTitle = profile
    ? `${profile.user.username}'s ${pageLabel}`
    : showAllRecipes ? 'Approved recipes' : 'Profile'
  const visibleRecipes = showAllRecipes ? recipes : recipes?.slice(0, recipePreviewLimit)

  function startEditingProfile() {
    setProfileMessage('')
    setIsEditingProfile(true)
  }

  function handleProfileSaved(updatedProfile) {
    setProfile(updatedProfile)
    setPictureFailed(false)
    setIsEditingProfile(false)
    setProfileMessage('Profile updated successfully.')
  }

  return (
    <div className="profile-page">
      <div className="content-frame">
        <section className="page-hero">
          <h1>{pageTitle}</h1>
        </section>

        {showAllRecipes ? (
          <div className="profile-page__add-recipe-row">
            <Link className="button button--ghost" to="/profile">
              Back to profile
            </Link>
          </div>
        ) : null}

        {profile ? (
          <>
            {!showAllRecipes ? (
              <section className="page-section">
                <article className="detail-panel detail-panel--profile-section">
                  <div className="profile-page__information">
                    <div className="detail-panel__stack profile-page__details">
                      <h2 className="profile-page__section-title">General information</h2>
                      <p className="profile-page__section-note">
                        <strong>First name:</strong> {profile.user.first_name || 'Not provided'}
                      </p>
                      <p className="profile-page__section-note">
                        <strong>Last name:</strong> {profile.user.last_name || 'Not provided'}
                      </p>
                      <p className="profile-page__section-note profile-page__bio">
                        <strong>Bio:</strong> {profile.bio || 'Not provided'}
                      </p>
                      <p className="profile-page__section-note">
                        <strong>Email:</strong> {profile.user.email || 'Not provided'}
                      </p>
                      <p className="profile-page__section-note">
                        <strong>Date joined:</strong>{' '}
                        {joinedDate ? (
                          <time dateTime={joinedDate}>{formatDate(joinedDate)}</time>
                        ) : (
                          'Not provided'
                        )}
                      </p>
                    </div>

                    <div className="profile-page__picture-controls">
                      <div className="profile-page__picture-box">
                        {profile.profile_picture && !pictureFailed ? (
                          <img
                            src={profile.profile_picture}
                            alt={`${profile.user.username}'s profile picture`}
                            onError={() => setPictureFailed(true)}
                          />
                        ) : (
                          <p className="profile-page__section-note profile-page__picture-empty">
                            {pictureFailed
                              ? 'Profile picture could not be loaded.'
                              : 'No profile picture added yet.'}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  {isEditingProfile ? (
                    <ProfileEditor
                      profile={profile}
                      onSaved={handleProfileSaved}
                      onCancel={() => setIsEditingProfile(false)}
                    />
                  ) : null}
                  {profileMessage ? <p className="status-banner" role="status">{profileMessage}</p> : null}
                  {!isEditingProfile ? (
                    <div className="profile-page__profile-actions">
                      <button className="button button--ghost" type="button" onClick={startEditingProfile}>
                        Edit profile
                      </button>
                    </div>
                  ) : null}
                </article>
              </section>
            ) : null}

            <section
              className={showAllRecipes ? 'page-section' : 'page-section profile-page__recipe-sections'}
            >
              {!showAllRecipes ? (
                <article className="detail-panel detail-panel--profile-section">
                  <h2 className="profile-page__section-title">Favorites</h2>
                  <ProfileRecipeList
                    recipes={favorites}
                    status={favoriteStatus}
                    emptyMessage="No saved favorites yet."
                  />
                </article>
              ) : null}

              <article className="detail-panel detail-panel--profile-section">
                <h2 className="profile-page__section-title">Approved recipes</h2>
                <ProfileRecipeList
                  recipes={visibleRecipes}
                  status={recipeStatus}
                  emptyMessage="No approved recipes yet."
                  compact={!showAllRecipes}
                />
                {!showAllRecipes && recipes?.length > recipePreviewLimit ? (
                  <div className="profile-page__add-recipe-row">
                    <Link className="button button--ghost" to="/profile/recipes">
                      See more
                    </Link>
                  </div>
                ) : null}
              </article>

              {!showAllRecipes ? (
                profile.user.is_staff === true ? (
                  <Link
                    className="button button--ghost profile-page__section-title profile-page__pending-button"
                    to="/staff"
                  >
                    Pending Approval
                  </Link>
                ) : (
                  <aside className="detail-panel detail-panel--profile-section">
                    <h2 className="profile-page__section-title">
                      Pending Approval{pendingRecipes ? ` (${pendingRecipes.length})` : ''}
                    </h2>
                    <ProfileRecipeList
                      recipes={pendingRecipes}
                      status={pendingStatus}
                      emptyMessage="No recipes waiting for approval."
                      compact
                    />
                  </aside>
                )
              ) : null}
              {!showAllRecipes && rejectedRecipes?.length > 0 ? (
                <article className="detail-panel detail-panel--profile-section">
                  <h2 className="profile-page__section-title">Rejected recipes ({rejectedRecipes.length})</h2>
                  <ProfileRecipeList
                    recipes={rejectedRecipes}
                    status=""
                    emptyMessage="No rejected recipes."
                    compact
                  />
                </article>
              ) : null}
            </section>

            <div className="profile-page__add-recipe-row profile-page__add-recipe-row--end">
              <Link className="button button--ghost" to="/add-recipe">
                Add recipe
              </Link>
            </div>
          </>
        ) : (
          <section className="page-section">
            <article className="detail-panel detail-panel--profile-section">
              <p className="status-banner" role="status" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {status}
              </p>
            </article>
          </section>
        )}
      </div>
    </div>
  )
}

export default ProfilePage
