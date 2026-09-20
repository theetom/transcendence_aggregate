import { Link, useLocation } from 'react-router-dom'

function AddRecipeSubmittedPage() {
  const { state } = useLocation()
  const recipe = state?.recipe
  return (
    <div className="content-frame add-recipe-submitted__frame">
      <section className="page-section add-recipe-submitted">
        <div className="add-recipe-submitted__content">
          <article className="form-panel add-recipe-submitted__panel">
            <h1>{recipe ? 'Recipe submitted' : 'Submission unavailable'}</h1>
            <div className="form-panel__body add-recipe-submitted__body">
              <p>
                {recipe ? `The backend created ${recipe.title}.` : 'No backend submission result was provided.'}
              </p>
            </div>
          </article>

          <div className="add-recipe-submitted__actions">
            <Link className="button button--ghost" to="/">
              Go back to main page
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}

export default AddRecipeSubmittedPage
