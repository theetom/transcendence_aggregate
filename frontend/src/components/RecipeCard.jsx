import { Link } from 'react-router-dom'

function RecipeCard({ recipe, variant = 'default' }) {
  const cardClassName = variant === 'compact' ? 'recipe-card recipe-card--compact' : 'recipe-card'
  return <article className={cardClassName}><h3>{recipe.title}</h3><Link className="text-link recipe-card__link-button" to={`/recipe/${encodeURIComponent(recipe.title)}`}>Open recipe</Link></article>
}

export default RecipeCard
