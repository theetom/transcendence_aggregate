import { Link, useParams } from 'react-router-dom'
import RecipeCard from '../components/RecipeCard'
import { getCategoryBySlug, getRecipesByCategory } from '../data/siteData'

function CategoryPage() {
  const { slug = '' } = useParams()
  const category = getCategoryBySlug(slug)
  const categoryRecipes = getRecipesByCategory(slug)

  if (!category) {
    return (
      <div className="content-frame">
        <section className="page-hero">
          <p className="eyebrow">Category page</p>
          <h1>Category not found</h1>
          <p className="page-hero__lead">
            This category route does not match the current recipe type list.
          </p>
          <div className="page-hero__actions">
            <Link className="header-button" to="/">
              Back to landing page
            </Link>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="content-frame">
      <section className="page-hero">
        <p className="eyebrow">Category page</p>
        <h1>{category.name}</h1>
      </section>

      <section className="page-section">
        {categoryRecipes.length > 0 ? (
          <div className="results-grid">
            {categoryRecipes.map((recipe) => (
              <RecipeCard key={recipe.slug} recipe={recipe} variant="compact" />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            No recipes are currently available in this category.
          </div>
        )}
      </section>
    </div>
  )
}

export default CategoryPage
