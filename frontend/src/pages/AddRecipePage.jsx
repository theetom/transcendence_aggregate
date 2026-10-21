import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authTokenStorageKey } from '../data/siteData'

const maxPictures = 2
const maxPictureSize = 5 * 1024 * 1024
const maxPicturesTotalSize = 20 * 1024 * 1024
const supportedPictureTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

async function requestRecipeApi(method, payload) {
  const endpoint = '/api/recipes/add_recipe/'
  const token = window.sessionStorage.getItem(authTokenStorageKey)
  const headers = {}

  if (token) {
    headers.Authorization = `Token ${token}`
  }

  if (!(payload instanceof FormData) && payload !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(endpoint, {
    method,
    headers,
    body:
      payload instanceof FormData || payload === undefined
        ? payload
        : JSON.stringify(payload),
  })

  const body = await response.text()
  const details =
    `${method} ${endpoint}\n` +
    `HTTP ${response.status} ${response.statusText}\n\n${body}`

  return { ok: response.ok, body, details }
}

function FieldError({ id, message }) {
  return message ? (
    <p id={id} className="status-banner add-recipe-form__error" role="alert">
      {message}
    </p>
  ) : null
}

function AddRecipePage() {
  const navigate = useNavigate()
  const [ingredientOptions, setIngredientOptions] = useState([])
  const [recipeCategories, setRecipeCategories] = useState([])
  const [recipeName, setRecipeName] = useState('')
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

  const validationErrors = {}

  if (!recipeName.trim()) {
    validationErrors['recipe-name'] = 'Enter a recipe title before submitting.'
  }

  ingredients.forEach((ingredient, index) => {
    const isEmpty =
      !ingredient.name.trim() &&
      !ingredient.quantity.trim() &&
      !ingredient.unit.trim()

    if (index > 0 && isEmpty) return

    if (!ingredient.name.trim()) {
      validationErrors[`ingredient-${index + 1}`] = 'Enter an ingredient name.'
    }
    if (!ingredient.quantity.trim()) {
      validationErrors[`quantity-${index + 1}`] = 'Enter a quantity for this ingredient.'
    } else if (!Number.isFinite(Number(ingredient.quantity)) || Number(ingredient.quantity) <= 0) {
      validationErrors[`quantity-${index + 1}`] = 'Enter a number greater than zero.'
    }
    if (!ingredient.unit.trim()) {
      validationErrors[`unit-${index + 1}`] = 'Enter a unit, such as g or pieces.'
    }
  })

  categories.forEach((category, index) => {
    if (index === 0 && !category.trim()) {
      validationErrors[`category-${index + 1}`] = 'Enter a category name.'
    }
  })

  steps.forEach((step, index) => {
    if (index === 0 && !step.trim()) {
      validationErrors[`step-${index + 1}`] = 'Enter instructions for this step.'
    }
  })

  if (!pictures.some(Boolean)) {
    validationErrors['picture-1'] = 'Add at least one photo before submitting.'
  }

  if (pictures.filter(Boolean).length > maxPictures) {
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
    let cancelled = false

    async function loadOptions() {
      let responseDetails = 'GET /api/recipes/add_recipe/'

      try {
        const result = await requestRecipeApi('GET')
        responseDetails = result.details

        if (cancelled) return

        if (!result.ok) {
          setStatus(responseDetails)
          return
        }

        const data = JSON.parse(result.body)

        if (
          !Array.isArray(data?.ingredients) ||
          !Array.isArray(data?.categories)
        ) {
          throw new Error(
            'The response must contain ingredients and categories arrays.',
          )
        }

        setIngredientOptions(data.ingredients)
        setRecipeCategories(data.categories)
      } catch (error) {
        if (!cancelled) {
          setStatus(`${responseDetails}\n\n${error.name}: ${error.message}`)
        }
      }
    }

    loadOptions()

    return () => {
      cancelled = true
    }
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()

    if (isSubmitting) {
      return
    }

    setHasAttemptedSubmit(true)
    const firstInvalidField = Object.keys(validationErrors)[0]

    if (firstInvalidField) {
      setStatus('')
      document.getElementById(firstInvalidField)?.focus()
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

    pictures.filter(Boolean).forEach((picture) => {
      payload.append('images', picture)
    })

    setIsSubmitting(true)
    setStatus('Submitting recipe...')

    try {
      const result = await requestRecipeApi('POST', payload)
      if (result.ok) {
        navigate('/add-recipe/submitted', { replace: true })
      } else {
        setStatus(result.details)
      }
    } catch (error) {
      setStatus(
        `POST /api/recipes/add_recipe/\n\n${error.name}: ${error.message}`,
      )
    } finally {
      setIsSubmitting(false)
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
    setIngredients((current) => [
      ...current,
      { name: '', quantity: '', unit: '' },
    ])
  }

  function addCategoryField() {
    setCategories((current) => [...current, ''])
  }

  function addStepField() {
    setSteps((current) => [...current, ''])
  }

  function addPictureField() {
    setPictures((current) =>
      current.length < maxPictures ? [...current, null] : current,
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
    const input = document.getElementById(`picture-${index + 1}`)
    if (input) input.value = ''
    setPictureSelectionError('')
    setPictures((current) =>
      current.map((picture, pictureIndex) => (pictureIndex === index ? null : picture)),
    )
  }

  return (
    <div className="content-frame">
      <section className="page-hero">
        <h1>Add recipe</h1>
      </section>

      <section className="page-section">
        <form className="dynamic-list" onSubmit={handleSubmit} noValidate>
          <article className="form-panel">
            <div className="field-list">
              <div className="field">
                <label htmlFor="recipe-name">Recipe name</label>
                <input
                  id="recipe-name"
                  type="text"
                  value={recipeName}
                  onChange={(event) => setRecipeName(event.target.value)}
                  required
                  aria-invalid={Boolean(fieldError('recipe-name'))}
                  aria-describedby={fieldError('recipe-name') ? 'recipe-name-error' : undefined}
                />
                <FieldError id="recipe-name-error" message={fieldError('recipe-name')} />
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
                      <FieldError id={`ingredient-${index + 1}-error`} message={fieldError(`ingredient-${index + 1}`)} />
                    </div>
                    <div className="field">
                      <label htmlFor={`quantity-${index + 1}`}>Quantity</label>
                      <input
                        id={`quantity-${index + 1}`}
                        type="text"
                        inputMode="decimal"
                        value={ingredient.quantity}
                        aria-invalid={Boolean(fieldError(`quantity-${index + 1}`))}
                        aria-describedby={fieldError(`quantity-${index + 1}`) ? `quantity-${index + 1}-error` : undefined}
                        onChange={(event) =>
                          updateIngredient(index, 'quantity', event.target.value)
                        }
                      />
                      <FieldError id={`quantity-${index + 1}-error`} message={fieldError(`quantity-${index + 1}`)} />
                    </div>
                    <div className="field">
                      <label htmlFor={`unit-${index + 1}`}>Unit</label>
                      <input
                        id={`unit-${index + 1}`}
                        type="text"
                        value={ingredient.unit}
                        aria-invalid={Boolean(fieldError(`unit-${index + 1}`))}
                        aria-describedby={fieldError(`unit-${index + 1}`) ? `unit-${index + 1}-error` : undefined}
                        onChange={(event) =>
                          updateIngredient(index, 'unit', event.target.value)
                        }
                      />
                      <FieldError id={`unit-${index + 1}-error`} message={fieldError(`unit-${index + 1}`)} />
                    </div>
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
                      <FieldError id={`category-${index + 1}-error`} message={fieldError(`category-${index + 1}`)} />
                    </div>
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
                    <FieldError id={`step-${index + 1}-error`} message={fieldError(`step-${index + 1}`)} />
                  </div>
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
            </p>
            <FieldError id="recipe-pictures-selection-error" message={pictureSelectionError} />
            <div className="form-panel__body dynamic-list">
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
                    <FieldError id={`picture-${index + 1}-error`} message={fieldError(`picture-${index + 1}`)} />
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
                disabled={pictures.length >= maxPictures || isSubmitting}
              >
                Add picture
              </button>
            </div>
          </article>

          <div className="form-panel__actions add-recipe-form__submit-row">
            <button type="submit" className="button button--ghost" disabled={isSubmitting}>
              {isSubmitting ? 'Submitting...' : 'Add recipe'}
            </button>
          </div>
          {status ? (
            <p
              className="status-banner"
              role="status"
              style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
            >
              {status}
            </p>
          ) : null}
        </form>
      </section>
    </div>
  )
}

export default AddRecipePage
