import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import './App.css'
import SiteHeader from './components/SiteHeader'
import SiteFooter from './components/SiteFooter'
import AddRecipePage from './pages/AddRecipePage'
import AddRecipeSubmittedPage from './pages/AddRecipeSubmittedPage'
import AdminPage from './pages/AdminPage'
import CategoryPage from './pages/CategoryPage'
import ConnectPage from './pages/ConnectPage'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import NotFoundPage from './pages/NotFoundPage'
import PrivacyPage from './pages/PrivacyPage'
import ProfilePage from './pages/ProfilePage'
import RecipePage from './pages/RecipePage'
import ReviewRequestPage from './pages/ReviewRequestPage'
import SearchResultsPage from './pages/SearchResultsPage'
import SignupPage from './pages/SignupPage'
import TermsPage from './pages/TermsPage'
import { isViewerAuthenticated } from './data/siteData'

function ProtectedRoute({ children }) {
  if (!isViewerAuthenticated()) {
    return <Navigate replace to="/connect" />
  }

  return children
}

function PublicOnlyRoute({ children }) {
  if (isViewerAuthenticated()) {
    return <Navigate replace to="/profile" />
  }

  return children
}

function AppShell() {
  const location = useLocation()
  const isHomePage = location.pathname === '/'
  const knownPathPattern = /^(?:\/|\/home|\/category(?:\/[^/]+)?|\/recipe\/[^/]+|\/results\/search|\/connect|\/login|\/signup|\/add-recipe(?:\/submitted)?|\/profile|\/admin(?:\/review\/[^/]+)?|\/privacy|\/terms)$/
  const hideShell = !knownPathPattern.test(location.pathname)
  const mainClassName = isHomePage ? 'page-main page-main--home' : 'page-main'

  return (
    <div className="site-frame">
      {!hideShell && <SiteHeader />}

      <main className={mainClassName}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/home" element={<Navigate replace to="/" />} />
          <Route path="/category" element={<Navigate replace to="/" />} />
          <Route path="/category/:slug" element={<CategoryPage />} />
          <Route path="/recipe/:slug" element={<RecipePage />} />
          <Route path="/results/search" element={<SearchResultsPage />} />
          <Route
            path="/connect"
            element={
              <PublicOnlyRoute>
                <ConnectPage />
              </PublicOnlyRoute>
            }
          />
          <Route
            path="/login"
            element={
              <PublicOnlyRoute>
                <LoginPage />
              </PublicOnlyRoute>
            }
          />
          <Route
            path="/signup"
            element={
              <PublicOnlyRoute>
                <SignupPage />
              </PublicOnlyRoute>
            }
          />
          <Route
            path="/add-recipe"
            element={
              <ProtectedRoute>
                <AddRecipePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/add-recipe/submitted"
            element={
              <ProtectedRoute>
                <AddRecipeSubmittedPage />
              </ProtectedRoute>
            }
          />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/admin/review/:slug" element={<ReviewRequestPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>

      {!hideShell && <SiteFooter />}
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  )
}

export default App
