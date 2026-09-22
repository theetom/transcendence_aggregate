import { useEffect, useState } from 'react'
import PageHero from '../components/PageHero'
import { authTokenStorageKey } from '../data/siteData'

async function requestRecipeApi(method, payload) {
  const endpoint = '/api/recipes/add_recipe/'
  const token = window.sessionStorage.getItem(authTokenStorageKey)
  const headers = {}

  if (token) {
    headers.Authorization = `Token ${token}`
  }

  if (payload !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(endpoint, {
    method,
    headers,
    body: payload === undefined ? undefined : JSON.stringify(payload),
  })

  const body = await response.text()
  const details =
    `${method} ${endpoint}\n` +
    `HTTP ${response.status} ${response.statusText}\n\n${body}`

  return { ok: response.ok, body, details }
}

function AddRecipePage() {
  const [ingredientOptions, setIngredientOptions] = useState([])
  const [recipeCategories, setRecipeCategories] = useState([])
  const [recipeName, setRecipeName] = useState('')
  const [ingredients, setIngredients] = useState([
    { name: '', quantity: '', unit: '' },
  ])
  const [categories, setCategories] = useState([''])
  const [steps, setSteps] = useState([''])
  const [pictures, setPictures] = useState([0])
  const [status, setStatus] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

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

    if (isSubmitting || !recipeName.trim()) {
      return
    }

    const payload = {
      title: recipeName.trim(),
      ingredients: ingredients
        .filter((ingredient) => ingredient.name)
        .map((ingredient) => ({
          name: ingredient.name,
          quantity: ingredient.quantity.trim(),
          unit: ingredient.unit.trim(),
        })),
      categories: categories
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

    setIsSubmitting(true)
    setStatus('Submitting recipe...')

    try {
      const result = await requestRecipeApi('POST', payload)
      setStatus(result.details)
    } catch (error) {
      setStatus(
        `POST /api/recipes/add_recipe/\n\n${error.name}: ${error.message}`,
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  function updateIngredient(index, field, value) {
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
    setPictures((current) => [...current, current.length])
  }

  return (
    <div className="content-frame">
      <PageHero eyebrow="Add recipe" title="Add recipe" />

      <section className="page-section">
        <form className="dynamic-list" onSubmit={handleSubmit}>
          <article className="form-panel">
            <div className="form-panel__body field-list">
              <div className="field">
                <label htmlFor="recipe-name">Recipe name</label>
                <input
                  id="recipe-name"
                  type="text"
                  value={recipeName}
                  onChange={(event) => setRecipeName(event.target.value)}
                  required
                />
              </div>
            </div>
          </article>

          <div className="split-grid">
            <article className="form-panel">
              <h3>Ingredients</h3>
              <div className="form-panel__body dynamic-list">
                {ingredients.map((ingredient, index) => (
                  <div key={`ingredient-${index + 1}`} className="dynamic-card field-list">
                    <div className="field">
                      <label htmlFor={`ingredient-${index + 1}`}>{`Ingredient ${index + 1}`}</label>
                      <select
                        id={`ingredient-${index + 1}`}
                        value={ingredient.name}
                        onChange={(event) =>
                          updateIngredient(index, 'name', event.target.value)
                        }
                        disabled={ingredientOptions.length === 0}
                      >
                        <option value="">
                          {ingredientOptions.length > 0
                            ? 'Select ingredient'
                            : 'Ingredient list not available yet'}
                        </option>
                        {ingredientOptions.map((option) => (
                          <option key={option.id} value={option.name}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor={`quantity-${index + 1}`}>Quantity</label>
                      <input
                        id={`quantity-${index + 1}`}
                        type="text"
                        value={ingredient.quantity}
                        onChange={(event) =>
                          updateIngredient(index, 'quantity', event.target.value)
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`unit-${index + 1}`}>Unit</label>
                      <input
                        id={`unit-${index + 1}`}
                        type="text"
                        value={ingredient.unit}
                        onChange={(event) =>
                          updateIngredient(index, 'unit', event.target.value)
                        }
                      />
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
              <div className="form-panel__body dynamic-list">
                {categories.map((category, index) => (
                  <div key={`category-${index + 1}`} className="dynamic-card field-list">
                    <div className="field">
                      <label htmlFor={`category-${index + 1}`}>{`Category ${index + 1}`}</label>
                      <select
                        id={`category-${index + 1}`}
                        value={category}
                        onChange={(event) => updateCategory(index, event.target.value)}
                        disabled={recipeCategories.length === 0}
                      >
                        <option value="">
                          {recipeCategories.length > 0
                            ? 'Select category'
                            : 'Category list not available yet'}
                        </option>
                        {recipeCategories.map((option) => (
                          <option key={option.id} value={option.name}>
                            {option.name}
                          </option>
                        ))}
                      </select>
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
                      onChange={(event) => updateStep(index, event.target.value)}
                    />
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
            <p>Picture upload is not implemented for this backend endpoint yet.</p>
            <div className="form-panel__body dynamic-list">
              {pictures.map((pictureId, index) => (
                <div key={`picture-${pictureId}`} className="dynamic-card field-list">
                  <div className="field">
                    <label htmlFor={`picture-${pictureId}`}>{`Picture ${index + 1}`}</label>
                    <input id={`picture-${pictureId}`} type="file" accept="image/*" disabled />
                  </div>
                </div>
              ))}
            </div>
            <div className="form-panel__actions">
              <button
                type="button"
                className="button button--ghost"
                onClick={addPictureField}
                disabled
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
