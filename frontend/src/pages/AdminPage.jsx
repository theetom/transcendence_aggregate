import BackendResponse from '../components/BackendResponse'

function AdminPage() {
  return (
    <div className="content-frame">
      <BackendResponse url="/api/admin/" />
    </div>
  )
}

export default AdminPage
