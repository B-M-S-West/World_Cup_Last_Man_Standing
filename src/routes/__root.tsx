import {
  createRootRoute,
  Link,
  Outlet,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const router = useRouter()

  useEffect(() => {
    // Check if there's already a session when the app loads
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
      // If not logged in and not already on the login page, redirect
      if (!session && !router.state.location.pathname.startsWith('/login')) {
        navigate({ to: '/login', replace: true })
      }
    })

    // Listen for login/logout events anywhere in the app
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
        if (!session) {
          navigate({ to: '/login', replace: true })
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  if (loading) {
    return <div>Loading...</div>
  }

  return (
    <>
      {user && (
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