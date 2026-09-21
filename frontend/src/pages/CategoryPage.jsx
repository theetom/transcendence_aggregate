import RecipeCard from '../components/RecipeCard'

function CategoryPage({ category = null, categoryRecipes = [] }) {
  return (
    <div className="content-frame">
      <section className="page-hero">
        <p className="eyebrow">Category page</p>
        <h1>{category?.name ?? 'Category'}</h1>
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
            Category recipes have not been loaded.
          </div>
        )}
      </section>
    </div>
  )
}

export default CategoryPage
