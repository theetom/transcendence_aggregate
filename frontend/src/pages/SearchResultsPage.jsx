import { useSearchParams } from 'react-router-dom'
import RecipeCard from '../components/RecipeCard'
import SectionTitle from '../components/SectionTitle'

function SearchResultsPage({ results = null }) {
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''

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
          title={results ? `${results.length} result${results.length === 1 ? '' : 's'} found` : 'Search results'}
          description="This section should render the database matches for the current query."
        />
        {results?.length > 0 ? (
          <div className="results-grid">
            {results.map((recipe) => (
              <RecipeCard key={recipe.slug} recipe={recipe} variant="compact" />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            {results ? 'No recipes matched the current query.' : 'Search results have not been loaded.'}
          </div>
        )}
      </section>
    </div>
  )
}

export default SearchResultsPage
