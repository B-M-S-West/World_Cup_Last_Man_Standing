import {
  createRootRoute,
  Link,
  Outlet,
  redirect,
  useNavigate,
} from '@tanstack/react-router'
import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useCurrentUser } from '../lib/queries'

export const Route = createRootRoute({
  beforeLoad: async ({ location }) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session && !location.pathname.startsWith('/login')) {
      throw redirect({ to: '/login', replace: true })
    }
  },
  component: RootLayout,
})

function RootLayout() {
  const navigate = useNavigate()
  const { data: currentUser } = useCurrentUser()
  const isAdmin = currentUser?.player?.is_admin === true
  const isLoggedIn = !!currentUser

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) navigate({ to: '/login', replace: true })
    })
    return () => subscription.unsubscribe()
  }, [navigate])

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  return (
    <>
      {isLoggedIn && (
        <header className="app-header">
          <div className="app-header-inner">
            <span className="app-logo">🏆 WC2026 — Last Man Standing</span>
            <nav className="app-nav">
              <Link to="/"         activeProps={{ className: 'active' }}>Home</Link>
              <Link to="/groups"   activeProps={{ className: 'active' }}>Groups</Link>
              <Link to="/fixtures" activeProps={{ className: 'active' }}>Fixtures</Link>
              <Link to="/bracket"  activeProps={{ className: 'active' }}>Bracket</Link>
              <Link to="/lms"      activeProps={{ className: 'active' }}>LMS</Link>
              <Link to="/pick"     activeProps={{ className: 'active' }}>My Pick</Link>
              {isAdmin && (
                <Link to="/admin" activeProps={{ className: 'active' }}>Admin</Link>
              )}
              <button className="btn-logout" onClick={handleLogout}>Sign Out</button>
            </nav>
          </div>
        </header>
      )}
      <main>
        <Outlet />
      </main>
    </>
  )
}