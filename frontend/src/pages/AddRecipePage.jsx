import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHero from '../components/PageHero'
import { getAuthToken } from '../auth'
import { requestJson } from '../api'
import { BackendError } from '../components/BackendResponse'

const ingredientRow = () => ({ name: '', quantity: '', unit: '' })

function AddRecipePage() {
  const navigate = useNavigate()
  const [options, setOptions] = useState(null)
  const [optionsError, setOptionsError] = useState('')
  const [recipeName, setRecipeName] = useState('')
  const [ingredients, setIngredients] = useState([ingredientRow()])
  const [categories, setCategories] = useState([''])
  const [steps, setSteps] = useState([''])
  const [status, setStatus] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    requestJson('/api/recipes/add_recipe/')
      .then((data) => {
        if (!Array.isArray(data.categories) || !Array.isArray(data.ingredients)) {
          throw new Error('The recipe options response is missing categories or ingredients.')
        }
        if (active) setOptions(data)
      })
      .catch((error) => { if (active) setOptionsError(error) })
    return () => { active = false }
  }, [])

  function updateIngredient(index, field, value) {
    setIngredients((rows) => rows.map((row, rowIndex) => (
      rowIndex === index ? { ...row, [field]: value } : row
    )))
  }

  function updateAt(setter, index, value) {
    setter((rows) => rows.map((row, rowIndex) => rowIndex === index ? value : row))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(null)
    setStatus('Submitting…')
    const token = getAuthToken()
    const payload = {
      title: recipeName,
      ingredients,
      categories: categories.filter(Boolean).map((name) => ({ name })),
      steps: steps.filter(Boolean).map((instruction, index) => ({
        step_number: index + 1,
        instruction,
      })),
      reviews: [],
    }

    // Login returns only a token. No user ID is guessed or taken from the public
    // users list; the API must report its missing-author validation itself.
    try {
      const recipe = await requestJson('/api/recipes/add_recipe/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Token ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      })
      if (!Number.isInteger(recipe?.id) || typeof recipe.title !== 'string') {
        throw new Error('The submission response did not include a created recipe.')
      }
      navigate('/add-recipe/submitted', { state: { recipe } })
    } catch (error) {
      setStatus('')
      setError(error)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="content-frame">
      <PageHero eyebrow="Add recipe" title="Add recipe" />
      <section className="page-section">
        <form className="dynamic-list" onSubmit={handleSubmit}>
          {optionsError ? <BackendError error={optionsError} /> : null}
          {!options && !optionsError ? <p>Loading recipe options…</p> : null}
          <article className="form-panel">
            <div className="form-panel__body field-list">
              <div className="field">
                <label htmlFor="recipe-name">Recipe name</label>
                <input id="recipe-name" value={recipeName} onChange={(event) => setRecipeName(event.target.value)} required />
              </div>
            </div>
          </article>
          <div className="split-grid">
            <article className="form-panel">
              <h3>Ingredients</h3>
              <div className="form-panel__body dynamic-list">
                {ingredients.map((ingredient, index) => (
                  <div key={index} className="dynamic-card field-list">
                    <div className="field">
                      <label htmlFor={`ingredient-${index}`}>Ingredient {index + 1}</label>
                      <select id={`ingredient-${index}`} value={ingredient.name} onChange={(event) => updateIngredient(index, 'name', event.target.value)} disabled={!options} required>
                        <option value="">Select ingredient</option>
                        {options?.ingredients.map((option) => <option key={option.id} value={option.name}>{option.name}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor={`quantity-${index}`}>Quantity</label>
                      <input id={`quantity-${index}`} value={ingredient.quantity} onChange={(event) => updateIngredient(index, 'quantity', event.target.value)} required />
                    </div>
                    <div className="field">
                      <label htmlFor={`unit-${index}`}>Unit</label>
                      <input id={`unit-${index}`} value={ingredient.unit} onChange={(event) => updateIngredient(index, 'unit', event.target.value)} required />
                    </div>
                  </div>
                ))}
              </div>
              <div className="form-panel__actions">
                <button type="button" className="button button--ghost" onClick={() => setIngredients((rows) => [...rows, ingredientRow()])}>Add ingredient</button>
              </div>
            </article>
            <article className="form-panel">
              <h3>Categories</h3>
              <div className="form-panel__body dynamic-list">
                {categories.map((category, index) => (
                  <div key={index} className="dynamic-card field-list">
                    <div className="field">
                      <label htmlFor={`category-${index}`}>Category {index + 1}</label>
                      <select id={`category-${index}`} value={category} onChange={(event) => updateAt(setCategories, index, event.target.value)} disabled={!options}>
                        <option value="">Select category</option>
                        {options?.categories.map((option) => <option key={option.id} value={option.name}>{option.name}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
              <div className="form-panel__actions">
                <button type="button" className="button button--ghost" onClick={() => setCategories((rows) => [...rows, ''])}>Add category</button>
              </div>
            </article>
          </div>
          <article className="form-panel">
            <h3>Steps</h3>
            <p className="empty-state">The backend currently treats steps as read-only; submitted steps will not be saved.</p>
            <div className="form-panel__body dynamic-list">
              {steps.map((step, index) => (
                <div key={index} className="dynamic-card field-list">
                  <div className="field">
                    <label htmlFor={`step-${index}`}>Step {index + 1}</label>
                    <textarea id={`step-${index}`} rows="4" value={step} onChange={(event) => updateAt(setSteps, index, event.target.value)} required />
                  </div>
                </div>
              ))}
            </div>
            <div className="form-panel__actions">
              <button type="button" className="button button--ghost" onClick={() => setSteps((rows) => [...rows, ''])}>Add step</button>
            </div>
          </article>
          <article className="form-panel">
            <h3>Pictures</h3>
            <div className="form-panel__body dynamic-list">
              <div className="dynamic-card field-list">
                <div className="field">
                  <label htmlFor="recipe-picture">Picture 1</label>
                  <input id="recipe-picture" type="file" accept="image/*" disabled />
                </div>
              </div>
            </div>
            <div className="form-panel__actions">
              <button type="button" className="button button--ghost" disabled>Add picture</button>
            </div>
          </article>
          {status ? <p className="empty-state" role="status">{status}</p> : null}
          {error ? <BackendError error={error} /> : null}
          <div className="form-panel__actions add-recipe-form__submit-row">
            <button type="submit" className="button button--ghost" disabled={submitting}>Add recipe</button>
          </div>
        </form>
      </section>
    </div>
  )
}

export default AddRecipePage
