import { useLocation } from 'react-router-dom'
import BackendResponse from '../components/BackendResponse'

function CategoryPage() {
  const { pathname } = useLocation()
  return (
    <div className="content-frame">
      <BackendResponse url={`/api${pathname.replace(/\/$/, '')}/`} />
    </div>
  )
}

export default CategoryPage
