import BackendResponse from '../components/BackendResponse'

function ProfilePage() {
  return (
    <div className="content-frame">
      <BackendResponse url="/api/me/" />
    </div>
  )
}

export default ProfilePage
