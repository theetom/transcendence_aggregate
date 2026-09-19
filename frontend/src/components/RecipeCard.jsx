import { Link } from 'react-router-dom'

function RecipeCard({ recipe, variant = 'default' }) {
  const cardClassName =
    variant === 'compact' ? 'recipe-card recipe-card--compact' : 'recipe-card'
  const recipePath = recipe?.slug ? `/recipe/${recipe.slug}` : null

  return (
    <article className={cardClassName} style={{ '--recipe-accent': recipe.accent }}>
      <h3>{recipe.title}</h3>
      <p className="recipe-card__summary">{recipe.summary}</p>
      {recipePath ? (
        <Link className="text-link recipe-card__link-button" to={recipePath}>
          Open recipe
        </Link>
      ) : (
        <span className="text-link">Recipe link pending</span>
      )}
    </article>
  )
}

export default RecipeCard
