import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import FieldError from '../components/FieldError'
import {
  getCurrentProfile,
  getRecipeDetails,
  getRecipePath,
  requestRecipeApi,
  updateRecipe,
} from '../data/recipeApi'

const maxPictures = 2
const maxPictureSize = 5 * 1024 * 1024
const maxPicturesTotalSize = 20 * 1024 * 1024
const supportedPictureTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

function getSaveError(error) {
  const fallback = error.message || 'Unable to save this recipe. Try again.'
  if (!error.fieldErrors) return fallback

  function readMessages(value) {
    if (typeof value === 'string') return [value]
    if (Array.isArray(value)) return value.flatMap(readMessages)
    if (value && typeof value === 'object') return Object.values(value).flatMap(readMessages)
    return []
  }

  function formatMessage(label, message) {
    const maxLength = message.match(/^Ensure this field has no more than (\d+) characters\.?$/i)
    return maxLength
      ? `${label} cannot exceed ${maxLength[1]} characters.`
      : `${label}: ${message}`
  }

  const labels = {
    title: 'Recipe name',
    description: 'Description',
    ingredients: 'Ingredients',
    categories: 'Categories',
    steps: 'Steps',
    images: 'Pictures',
    retained_image_ids: 'Saved pictures',
    non_field_errors: 'Recipe',
  }
  const ingredientFields = { name: 'name', quantity: 'quantity', unit: 'unit' }
  const messages = Object.entries(error.fieldErrors).flatMap(([field, value]) => {
    if (field === 'ingredients' && value && typeof value === 'object') {
      return Object.entries(value).flatMap(([index, rowErrors]) => {
        if (!/^\d+$/.test(index) || !rowErrors || typeof rowErrors !== 'object' || Array.isArray(rowErrors)) {
          return readMessages(rowErrors).map((message) => formatMessage('Ingredients', message))
        }
        return Object.entries(rowErrors).flatMap(([name, errors]) => {
          const suffix = ingredientFields[name]
          const label = `Ingredient ${Number(index) + 1}${suffix ? ` ${suffix}` : ''}`
          return readMessages(errors).map((message) => formatMessage(label, message))
        })
      })
    }
    return readMessages(value).map((message) => formatMessage(labels[field] || 'Recipe', message))
  })
  return messages.join('\n') || fallback
}

function AddRecipePage({ editMode = false }) {
  const navigate = useNavigate()
  const { recipeId } = useParams()
  const submittingRef = useRef(false)
  const mountedRef = useRef(true)
  const [ingredientOptions, setIngredientOptions] = useState([])
  const [recipeCategories, setRecipeCategories] = useState([])
  const [recipeName, setRecipeName] = useState('')
  const [originalRecipe, setOriginalRecipe] = useState(null)
  const [isStaff, setIsStaff] = useState(false)
  const [isLoading, setIsLoading] = useState(editMode)
  const [loadFailed, setLoadFailed] = useState(false)
  const [requiresReload, setRequiresReload] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [savedPictures, setSavedPictures] = useState([])
  const [ingredients, setIngredients] = useState([
    { name: '', quantity: '', unit: '' },
  ])
  const [categories, setCategories] = useState([''])
  const [steps, setSteps] = useState([''])
  const [pictures, setPictures] = useState([null])
  const [pictureSelectionError, setPictureSelectionError] = useState('')
  const [status, setStatus] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false)
  const submitsForApproval = editMode && (!isStaff || originalRecipe?.rejected === true)
  const pageTitle = !editMode ? 'Add recipe'
    : originalRecipe?.rejected ? 'Edit and resubmit recipe' : 'Edit recipe'
  const submitLabel = !editMode ? 'Add recipe'
    : originalRecipe?.rejected ? 'Save and resubmit'
      : submitsForApproval ? 'Save and submit for approval' : 'Save changes'

  const validationErrors = {}

  if (!recipeName.trim()) {
    validationErrors['recipe-name'] = 'Enter a recipe title before submitting.'
  }

  const ingredientNames = new Set()
  ingredients.forEach((ingredient, index) => {
    const isEmpty =
      !ingredient.name.trim() &&
      !ingredient.quantity.trim() &&
      !ingredient.unit.trim()

    if (index > 0 && isEmpty) return

    const ingredientName = ingredient.name.trim().toLowerCase()
    if (!ingredientName) {
      validationErrors[`ingredient-${index + 1}`] = 'Enter an ingredient name.'
    } else if (ingredientNames.has(ingredientName)) {
      validationErrors[`ingredient-${index + 1}`] = 'This ingredient is already listed.'
    }
    if (ingredientName) ingredientNames.add(ingredientName)
    if (!ingredient.quantity.trim()) {
      validationErrors[`quantity-${index + 1}`] = 'Enter a quantity for this ingredient.'
    } else if (!Number.isFinite(Number(ingredient.quantity)) || Number(ingredient.quantity) <= 0) {
      validationErrors[`quantity-${index + 1}`] = 'Enter a number greater than zero.'
    }
    if (!ingredient.unit.trim()) {
      validationErrors[`unit-${index + 1}`] = 'Enter a unit, such as g or pieces.'
    }
  })

  const categoryNames = new Set()
  categories.forEach((category, index) => {
    const categoryName = category.trim().toLowerCase()
    if (!editMode && index === 0 && !categoryName) {
      validationErrors[`category-${index + 1}`] = 'Enter a category name.'
    } else if (categoryName && categoryNames.has(categoryName)) {
      validationErrors[`category-${index + 1}`] = 'This category is already listed.'
    }
    if (categoryName) categoryNames.add(categoryName)
  })

  steps.forEach((step, index) => {
    if (index === 0 && !step.trim()) {
      validationErrors[`step-${index + 1}`] = 'Enter instructions for this step.'
    }
  })

  if (!savedPictures.length && !pictures.some(Boolean)) {
    validationErrors['picture-1'] = 'Add at least one photo before submitting.'
  }

  if (savedPictures.length + pictures.filter(Boolean).length > maxPictures) {
    validationErrors['picture-1'] = 'Add no more than two photos per recipe.'
  }

  pictures.forEach((picture, index) => {
    if (picture && (!supportedPictureTypes.includes(picture.type) || picture.size === 0)) {
      validationErrors[`picture-${index + 1}`] = 'Choose a nonempty JPEG, PNG, GIF or WebP photo.'
    } else if (picture && picture.size > maxPictureSize) {
      validationErrors[`picture-${index + 1}`] = 'Each photo must be 5 MiB or smaller.'
    }
  })

  if (pictures.reduce((total, picture) => total + (picture?.size ?? 0), 0) > maxPicturesTotalSize) {
    validationErrors['picture-1'] = 'The selected photos must total 20 MiB or less.'
  }

  function fieldError(id) {
    return hasAttemptedSubmit ? validationErrors[id] : undefined
  }

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadOptions() {
      try {
        const data = await requestRecipeApi('/api/recipes/add_recipe/', { requiresAuth: true })

        if (cancelled) return

        if (
          !Array.isArray(data?.ingredients) ||
          !Array.isArray(data?.categories)
        ) {
          throw new Error(
            'Recipe options could not be read. Reload and try again.',
          )
        }

        setIngredientOptions(data.ingredients)
        setRecipeCategories(data.categories)
      } catch (error) {
        if (!cancelled && !editMode) {
          setStatus(error.message || 'Unable to load recipe options. Try again.')
        }
      }
    }

    loadOptions()

    return () => {
      cancelled = true
    }
  }, [editMode])

  useEffect(() => {
    if (!editMode) return undefined

    const controller = new AbortController()

    async function loadRecipe() {
      setIsLoading(true)
      setLoadFailed(false)
      setStatus('')

      try {
        const [recipe, profile] = await Promise.all([
          getRecipeDetails(recipeId, controller.signal),
          getCurrentProfile(controller.signal),
        ])
        if (controller.signal.aborted) return

        const ownsRecipe = Number.isSafeInteger(profile.user.id) && recipe.user === profile.user.id
        if (!profile.user.is_staff && !ownsRecipe) {
          throw new Error('You can only edit your own recipes.')
        }
        if (!profile.user.is_staff && recipe.deletion_requested) {
          throw new Error('This recipe is awaiting admin approval for deletion.')
        }
        if (!Array.isArray(recipe.images) || !Array.isArray(recipe.categories)
          || recipe.images.some((picture) => !Number.isSafeInteger(picture?.id)
            || picture.id < 1 || typeof picture.image !== 'string' || !picture.image.trim())
          || new Set(recipe.images.map((picture) => picture.id)).size !== recipe.images.length
          || recipe.categories.some((category) => typeof category?.name !== 'string')) {
          throw new Error('The saved recipe could not be read. Reload and try again.')
        }

        setOriginalRecipe(recipe)
        setIsStaff(profile.user.is_staff)
        setRecipeName(recipe.title)
        setIngredients(recipe.ingredients.length
          ? recipe.ingredients.map(({ name, quantity, unit }) => ({ name, quantity, unit }))
          : [{ name: '', quantity: '', unit: '' }])
        setCategories(recipe.categories.length ? recipe.categories.map(({ name }) => name) : [''])
        setSteps(recipe.steps.length
          ? [...recipe.steps].sort((first, second) => first.step_number - second.step_number)
            .map(({ instruction }) => instruction)
          : [''])
        setSavedPictures(recipe.images)
        setPictures(recipe.images.length < maxPictures ? [null] : [])
        setHasUnsavedChanges(false)
      } catch (error) {
        if (controller.signal.aborted) return
        setLoadFailed(true)
        setStatus(error.message || 'Unable to load this recipe for editing. Try again.')
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    loadRecipe()
    return () => controller.abort()
  }, [editMode, recipeId])

  useEffect(() => {
    if (!editMode || !hasUnsavedChanges) return undefined
    function warnBeforeLeaving(event) {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeLeaving)
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving)
  }, [editMode, hasUnsavedChanges])

  async function handleSubmit(event) {
    event.preventDefault()

    if (submittingRef.current || isLoading || loadFailed || requiresReload) {
      return
    }

    setHasAttemptedSubmit(true)
    const firstInvalidField = Object.keys(validationErrors)[0]

    if (firstInvalidField) {
      setStatus('')
      document.getElementById(firstInvalidField)?.focus()
      return
    }

    if (submitsForApproval && !window.confirm(
      'Save your changes and submit this recipe for admin approval? It will stay hidden from public pages until approved.',
    )) {
      return
    }

    const recipeData = {
      title: recipeName.trim(),
      ingredients: ingredients
        .filter((ingredient) => ingredient.name.trim())
        .map((ingredient) => ({
          name: ingredient.name.trim(),
          quantity: ingredient.quantity.trim(),
          unit: ingredient.unit.trim(),
        })),
      categories: categories
        .map((name) => name.trim())
        .filter(Boolean)
        .map((name) => ({ name })),
      steps: steps
        .map((instruction) => instruction.trim())
        .filter(Boolean)
        .map((instruction, index) => ({
          step_number: index + 1,
          instruction,
        })),
    }

    const payload = new FormData()
    payload.append('title', recipeData.title)
    payload.append('ingredients', JSON.stringify(recipeData.ingredients))
    payload.append('categories', JSON.stringify(recipeData.categories))
    payload.append('steps', JSON.stringify(recipeData.steps))

    if (editMode) {
      payload.append('content_revision', String(originalRecipe.content_revision))
      payload.append('retained_image_ids', JSON.stringify(savedPictures.map((picture) => picture.id)))
      if (originalRecipe.rejected) payload.append('resubmit', 'true')
    }

    pictures.filter(Boolean).forEach((picture) => {
      payload.append('images', picture)
    })

    submittingRef.current = true
    setIsSubmitting(true)
    setStatus(editMode ? 'Saving recipe...' : 'Submitting recipe...')

    try {
      if (editMode) {
        const savedRecipe = await updateRecipe(recipeId, payload)
        if (!mountedRef.current) return
        if (submitsForApproval && (savedRecipe.approved || savedRecipe.rejected)) {
          throw Object.assign(new Error('The submission could not be confirmed as pending approval. Reload before editing again.'), {
            requiresReload: true,
          })
        }
        setHasUnsavedChanges(false)
        navigate(getRecipePath(savedRecipe.id), {
          replace: true,
          state: { recipeEditSaved: true, submittedForApproval: submitsForApproval },
        })
      } else {
        await requestRecipeApi('/api/recipes/add_recipe/', {
          method: 'POST', requiresAuth: true, body: payload, expectedStatus: 201,
        })
        if (!mountedRef.current) return
        navigate('/add-recipe/submitted', { replace: true })
      }
    } catch (error) {
      if (!mountedRef.current) return
      if (editMode && error.requiresReload) setRequiresReload(true)
      setStatus(getSaveError(error))
    } finally {
      submittingRef.current = false
      if (mountedRef.current) setIsSubmitting(false)
    }
  }

  function updateIngredient(index, field, value) {
    if (field === 'quantity' && !/^\d*\.?\d*$/.test(value)) {
      return
    }

    setIngredients((current) =>
      current.map((ingredient, ingredientIndex) =>
        ingredientIndex === index
          ? { ...ingredient, [field]: value }
          : ingredient,
      ),
    )
  }

  function updateCategory(index, value) {
    setCategories((current) =>
      current.map((category, categoryIndex) => (categoryIndex === index ? value : category)),
    )
  }

  function updateStep(index, value) {
    setSteps((current) =>
      current.map((step, stepIndex) => (stepIndex === index ? value : step)),
    )
  }

  function addIngredientField() {
    setHasUnsavedChanges(true)
    setIngredients((current) => [
      ...current,
      { name: '', quantity: '', unit: '' },
    ])
  }

  function addCategoryField() {
    setHasUnsavedChanges(true)
    setCategories((current) => [...current, ''])
  }

  function addStepField() {
    setHasUnsavedChanges(true)
    setSteps((current) => [...current, ''])
  }

  function addPictureField() {
    setHasUnsavedChanges(true)
    setPictures((current) =>
      savedPictures.length + current.length < maxPictures ? [...current, null] : current,
    )
  }

  function updatePicture(index, input) {
    const files = input.files
    const file = files?.length === 1 ? files[0] : null

    if (files?.length > 1) {
      input.value = ''
      setPictureSelectionError('Choose one file per picture field, up to two photos per recipe.')
    } else {
      setPictureSelectionError('')
    }

    setPictures((current) =>
      current.map((picture, pictureIndex) => (pictureIndex === index ? file : picture)),
    )
  }

  function removePicture(index) {
    setHasUnsavedChanges(true)
    const input = document.getElementById(`picture-${index + 1}`)
    if (input) input.value = ''
    setPictureSelectionError('')
    setPictures((current) =>
      current.map((picture, pictureIndex) => (pictureIndex === index ? null : picture)),
    )
  }

  function removeSavedPicture(pictureId) {
    setHasUnsavedChanges(true)
    setSavedPictures((current) => current.filter((picture) => picture.id !== pictureId))
    setPictures((current) => current.length ? current : [null])
  }

  function removeListItem(setItems, index) {
    if (index <= 0) return
    setHasUnsavedChanges(true)
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }

  function cancelEdit() {
    if (hasUnsavedChanges && !window.confirm('Discard your unsaved recipe changes?')) return
    navigate(getRecipePath(recipeId))
  }

  if (editMode && (isLoading || loadFailed)) {
    return (
      <div className="content-frame">
        <section className="page-hero"><h1>Edit recipe</h1></section>
        <section className="page-section">
          <p className="status-banner" role={loadFailed ? 'alert' : 'status'}>
            {isLoading ? 'Loading recipe...' : status}
          </p>
          <button type="button" className="button button--ghost" onClick={() => navigate('/profile/recipes')}>
            Back to my recipes
          </button>
        </section>
      </div>
    )
  }

  return (
    <div className="content-frame">
      <section className="page-hero">
        <h1>{pageTitle}</h1>
        {editMode ? (
          <p className="page-hero__lead">
            {submitsForApproval
              ? 'Saving sends this recipe to the admin for approval. It will stay hidden from public pages until approved.'
              : 'Save changes to this recipe. Its current approval status will stay the same.'}
          </p>
        ) : null}
        {editMode && originalRecipe?.rejected ? (
          <p className="recipe-review__reason"><strong>Previous rejection reason:</strong> {originalRecipe.rejection_reason}</p>
        ) : null}
      </section>

      <section className="page-section">
        <form className="dynamic-list" onSubmit={handleSubmit} onChangeCapture={() => setHasUnsavedChanges(true)} noValidate>
          <fieldset className="dynamic-list" disabled={isSubmitting || requiresReload} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <article className="form-panel">
            <div className="field-list">
              <div className="field">
                <label htmlFor="recipe-name">Recipe name</label>
                <input
                  id="recipe-name"
                  type="text"
                  maxLength={editMode ? 100 : undefined}
                  value={recipeName}
                  onChange={(event) => setRecipeName(event.target.value)}
                  required
                  aria-invalid={Boolean(fieldError('recipe-name'))}
                  aria-describedby={fieldError('recipe-name') ? 'recipe-name-error' : undefined}
                />
                <FieldError id="recipe-name-error" message={fieldError('recipe-name')} className="add-recipe-form__error" />
              </div>
            </div>
          </article>

          <div className="split-grid">
            <article className="form-panel">
              <h3>Ingredients</h3>
              <datalist id="ingredient-suggestions">
                {ingredientOptions.map((option) => (
                  <option key={option.id} value={option.name} />
                ))}
              </datalist>
              <div className="form-panel__body dynamic-list">
                {ingredients.map((ingredient, index) => (
                  <div key={`ingredient-${index + 1}`} className="dynamic-card field-list">
                    <div className="field">
                      <label htmlFor={`ingredient-${index + 1}`}>{`Ingredient ${index + 1}`}</label>
                      <input
                        id={`ingredient-${index + 1}`}
                        type="text"
                        list="ingredient-suggestions"
                        maxLength={100}
                        placeholder="Type or choose an ingredient"
                        value={ingredient.name}
                        onChange={(event) =>
                          updateIngredient(index, 'name', event.target.value)
                        }
                        aria-invalid={Boolean(fieldError(`ingredient-${index + 1}`))}
                        aria-describedby={fieldError(`ingredient-${index + 1}`) ? `ingredient-${index + 1}-error` : undefined}
                      />
                      <FieldError id={`ingredient-${index + 1}-error`} message={fieldError(`ingredient-${index + 1}`)} className="add-recipe-form__error" />
                    </div>
                    <div className="field">
                      <label htmlFor={`quantity-${index + 1}`}>Quantity</label>
                      <input
                        id={`quantity-${index + 1}`}
                        type="text"
                        inputMode="decimal"
                        maxLength={editMode ? 50 : undefined}
                        value={ingredient.quantity}
                        aria-invalid={Boolean(fieldError(`quantity-${index + 1}`))}
                        aria-describedby={fieldError(`quantity-${index + 1}`) ? `quantity-${index + 1}-error` : undefined}
                        onChange={(event) =>
                          updateIngredient(index, 'quantity', event.target.value)
                        }
                      />
                      <FieldError id={`quantity-${index + 1}-error`} message={fieldError(`quantity-${index + 1}`)} className="add-recipe-form__error" />
                    </div>
                    <div className="field">
                      <label htmlFor={`unit-${index + 1}`}>Unit</label>
                      <input
                        id={`unit-${index + 1}`}
                        type="text"
                        maxLength={editMode ? 50 : undefined}
                        value={ingredient.unit}
                        aria-invalid={Boolean(fieldError(`unit-${index + 1}`))}
                        aria-describedby={fieldError(`unit-${index + 1}`) ? `unit-${index + 1}-error` : undefined}
                        onChange={(event) =>
                          updateIngredient(index, 'unit', event.target.value)
                        }
                      />
                      <FieldError id={`unit-${index + 1}-error`} message={fieldError(`unit-${index + 1}`)} className="add-recipe-form__error" />
                    </div>
                    {index > 0 ? (
                      <button
                        type="button"
                        className="button button--ghost"
                        onClick={() => removeListItem(setIngredients, index)}
                        aria-label={`Remove ingredient ${index + 1}`}
                      >
                        Remove ingredient
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="form-panel__actions">
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={addIngredientField}
                >
                  Add ingredient
                </button>
              </div>
            </article>

            <article className="form-panel">
              <h3>Categories</h3>
              {editMode ? <p>Categories are optional. Clear the fields to remove all categories.</p> : null}
              <datalist id="category-suggestions">
                {recipeCategories.map((option) => (
                  <option key={option.id} value={option.name} />
                ))}
              </datalist>
              <div className="form-panel__body dynamic-list">
                {categories.map((category, index) => (
                  <div key={`category-${index + 1}`} className="dynamic-card field-list">
                    <div className="field">
                      <label htmlFor={`category-${index + 1}`}>{`Category ${index + 1}`}</label>
                      <input
                        id={`category-${index + 1}`}
                        type="text"
                        list="category-suggestions"
                        maxLength={100}
                        placeholder="Type or choose a category"
                        value={category}
                        onChange={(event) => updateCategory(index, event.target.value)}
                        aria-invalid={Boolean(fieldError(`category-${index + 1}`))}
                        aria-describedby={fieldError(`category-${index + 1}`) ? `category-${index + 1}-error` : undefined}
                      />
                      <FieldError id={`category-${index + 1}-error`} message={fieldError(`category-${index + 1}`)} className="add-recipe-form__error" />
                    </div>
                    {index > 0 ? (
                      <button
                        type="button"
                        className="button button--ghost"
                        onClick={() => removeListItem(setCategories, index)}
                        aria-label={`Remove category ${index + 1}`}
                      >
                        Remove category
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="form-panel__actions">
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={addCategoryField}
                >
                  Add category
                </button>
              </div>
            </article>
          </div>

          <article className="form-panel">
            <h3>Steps</h3>
            <div className="form-panel__body dynamic-list">
              {steps.map((step, index) => (
                <div key={`step-${index + 1}`} className="dynamic-card field-list">
                  <div className="field">
                    <label htmlFor={`step-${index + 1}`}>{`Step ${index + 1}`}</label>
                    <textarea
                      id={`step-${index + 1}`}
                      rows="4"
                      value={step}
                      aria-invalid={Boolean(fieldError(`step-${index + 1}`))}
                      aria-describedby={fieldError(`step-${index + 1}`) ? `step-${index + 1}-error` : undefined}
                      onChange={(event) => updateStep(index, event.target.value)}
                    />
                    <FieldError id={`step-${index + 1}-error`} message={fieldError(`step-${index + 1}`)} className="add-recipe-form__error" />
                  </div>
                  {index > 0 ? (
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={() => removeListItem(setSteps, index)}
                      aria-label={`Remove step ${index + 1}`}
                    >
                      Remove step
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="form-panel__actions">
              <button type="button" className="button button--ghost" onClick={addStepField}>
                Add step
              </button>
            </div>
          </article>

          <article className="form-panel">
            <h3>Pictures</h3>
            <p id="recipe-pictures-notice">
              Add one or two JPEG, PNG, GIF or WebP photos. Choose one file per picture
              field. Each photo can be up to 5 MiB.
              {editMode ? ' Saved photos count toward the two-photo limit. To replace one, remove it and choose a new file.' : ''}
            </p>
            <FieldError id="recipe-pictures-selection-error" message={pictureSelectionError} className="add-recipe-form__error" />
            <div className="form-panel__body dynamic-list">
              {savedPictures.map((picture, index) => (
                <div key={picture.id} className="dynamic-card field-list">
                  <p>{`Saved picture ${index + 1}`}</p>
                  <img
                    src={picture.image}
                    alt={`Saved recipe picture ${index + 1}`}
                    style={{ width: '100%', maxWidth: '24rem', maxHeight: '16rem', objectFit: 'contain' }}
                  />
                  <button
                    type="button"
                    className="button button--ghost"
                    onClick={() => removeSavedPicture(picture.id)}
                    aria-label={`Remove saved picture ${index + 1}`}
                  >
                    Remove saved picture
                  </button>
                </div>
              ))}
              {pictures.map((picture, index) => (
                <div key={`picture-${index + 1}`} className="dynamic-card field-list">
                  <div className="field">
                    <label htmlFor={`picture-${index + 1}`}>{`Picture ${index + 1}`}</label>
                    <input
                      id={`picture-${index + 1}`}
                      type="file"
                      accept={supportedPictureTypes.join(',')}
                      disabled={isSubmitting}
                      onChange={(event) => updatePicture(index, event.currentTarget)}
                      aria-invalid={Boolean(pictureSelectionError || fieldError(`picture-${index + 1}`))}
                      aria-describedby={[
                        'recipe-pictures-notice',
                        pictureSelectionError && 'recipe-pictures-selection-error',
                        fieldError(`picture-${index + 1}`) && `picture-${index + 1}-error`,
                      ].filter(Boolean).join(' ')}
                    />
                    <FieldError id={`picture-${index + 1}-error`} message={fieldError(`picture-${index + 1}`)} className="add-recipe-form__error" />
                  </div>
                  {picture ? (
                    <button
                      type="button"
                      className="button button--ghost"
                      disabled={isSubmitting}
                      onClick={() => removePicture(index)}
                      aria-label={`Remove picture ${index + 1}`}
                    >
                      Remove picture
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="form-panel__actions">
              <button
                type="button"
                className="button button--ghost"
                onClick={addPictureField}
                disabled={savedPictures.length + pictures.length >= maxPictures || isSubmitting}
              >
                Add picture
              </button>
            </div>
          </article>

          <div className="form-panel__actions add-recipe-form__submit-row" style={{ flexWrap: 'wrap' }}>
            <button type="submit" className="button button--ghost" disabled={isSubmitting}>
              {isSubmitting ? editMode ? 'Saving...' : 'Submitting...' : submitLabel}
            </button>
            {editMode ? (
              <button type="button" className="button button--ghost" onClick={cancelEdit} disabled={isSubmitting}>
                Cancel
              </button>
            ) : null}
          </div>
          </fieldset>
          {status ? (
            <p
              className="status-banner"
              role="status"
              style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
            >
              {status}
            </p>
          ) : null}
          {requiresReload ? (
            <div className="form-panel__actions">
              <p>Reload this recipe before saving again. Unsaved changes will be discarded.</p>
              <button type="button" className="button button--ghost" onClick={() => window.location.reload()}>
                Reload recipe
              </button>
            </div>
          ) : null}
        </form>
      </section>
    </div>
  )
}

export default AddRecipePage
