import { Link } from 'react-router-dom'

function AddRecipeSubmittedPage() {
  return (
    <div className="content-frame add-recipe-submitted__frame">
      <section className="page-section add-recipe-submitted">
        <div className="add-recipe-submitted__content">
          <article className="form-panel add-recipe-submitted__panel">
            <h1>Recipe submission preview</h1>
            <div className="form-panel__body add-recipe-submitted__body">
              <p>
                The database-backed submission flow is not connected yet, so no
                recipe data was saved.
              </p>
            </div>
          </article>

          <div className="add-recipe-submitted__actions">
            <Link className="button button--ghost" to="/">
              Go back to main page
            </Link>
            <Link className="button button--ghost" to="/profile">
              Go back to profile
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}

export default AddRecipeSubmittedPage
