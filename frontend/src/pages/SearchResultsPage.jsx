import { useLocation } from 'react-router-dom'
import BackendResponse from '../components/BackendResponse'

function SearchResultsPage() {
  const { search } = useLocation()
  return (
    <div className="content-frame">
      <BackendResponse url={`/api/results/search/${search}`} />
    </div>
  )
}

export default SearchResultsPage
