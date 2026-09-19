import { useSearchParams } from 'react-router-dom'
import RecipeCard from '../components/RecipeCard'
import SectionTitle from '../components/SectionTitle'
import { searchRecipes } from '../data/siteData'

function SearchResultsPage() {
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const results = searchRecipes(query)

  return (
    <div className="content-frame">
      <section className="page-hero">
        <p className="eyebrow">Results / search</p>
        <h1>{query ? `Results for "${query}"` : 'Search all recipes'}</h1>
        <p className="page-hero__lead">
          The shared header search bar lands here. Results will appear once
          search is connected to live backend data.
        </p>
      </section>

      <section className="page-section">
        <SectionTitle
          eyebrow="Matches"
          title={`${results.length} result${results.length === 1 ? '' : 's'} found`}
          description="This section should render the database matches for the current query."
        />
        {results.length > 0 ? (
          <div className="results-grid">
            {results.map((recipe) => (
              <RecipeCard key={recipe.slug} recipe={recipe} variant="compact" />
            ))}
          </div>
        ) : (
          <div className="empty-state">No recipes matched the current query.</div>
        )}
      </section>
    </div>
  )
}

export default SearchResultsPage
