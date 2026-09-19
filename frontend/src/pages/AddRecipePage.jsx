import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHero from '../components/PageHero'
import { recipeCategories, recipes } from '../data/siteData'

function getIngredientOptions() {
  return Array.from(
    new Set(
      recipes.flatMap((recipe) =>
        Array.isArray(recipe.ingredients)
          ? recipe.ingredients.filter(
              (ingredient) => typeof ingredient === 'string' && ingredient.trim(),
            )
          : [],
      ),
    ),
  ).sort((left, right) => left.localeCompare(right))
}

function AddRecipePage() {
  const navigate = useNavigate()
  const ingredientOptions = getIngredientOptions()
  const [recipeName, setRecipeName] = useState('')
  const [ingredients, setIngredients] = useState([''])
  const [categories, setCategories] = useState([''])
  const [steps, setSteps] = useState([''])
  const [pictures, setPictures] = useState([0])

  function handleSubmit(event) {
    event.preventDefault()

    const trimmedRecipeName = recipeName.trim()

    if (!trimmedRecipeName) {
      return
    }

    navigate('/add-recipe/submitted')
  }

  function updateIngredient(index, value) {
    setIngredients((current) =>
      current.map((ingredient, ingredientIndex) =>
        ingredientIndex === index ? value : ingredient,
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
    setIngredients((current) => [...current, ''])
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
                        value={ingredient}
                        onChange={(event) => updateIngredient(index, event.target.value)}
                        disabled={ingredientOptions.length === 0}
                      >
                        <option value="">
                          {ingredientOptions.length > 0
                            ? 'Select ingredient'
                            : 'Ingredient list not available yet'}
                        </option>
                        {ingredientOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
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
                      >
                        <option value="">Select category</option>
                        {recipeCategories.map((option) => (
                          <option key={option.id} value={option.slug}>
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
            <div className="form-panel__body dynamic-list">
              {pictures.map((pictureId, index) => (
                <div key={`picture-${pictureId}`} className="dynamic-card field-list">
                  <div className="field">
                    <label htmlFor={`picture-${pictureId}`}>{`Picture ${index + 1}`}</label>
                    <input id={`picture-${pictureId}`} type="file" accept="image/*" />
                  </div>
                </div>
              ))}
            </div>
            <div className="form-panel__actions">
              <button
                type="button"
                className="button button--ghost"
                onClick={addPictureField}
              >
                Add picture
              </button>
            </div>
          </article>

          <div className="form-panel__actions add-recipe-form__submit-row">
            <button type="submit" className="button button--ghost">
              Add recipe
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

export default AddRecipePage
