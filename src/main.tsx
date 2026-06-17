import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { routeTree } from './routeTree.gen'
import './styles/global.css'

// ── Router ────────────────────────────────────────────────────
// createRouter reads the auto-generated routeTree and handles
// all navigation. The declare module block gives TypeScript
// full type safety for navigation — if you try to navigate to
// a route that doesn't exist it'll be a compile error.
const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// ── Query Client ──────────────────────────────────────────────
// One QueryClient for the whole app. All the useQuery hooks
// in queries.ts share this same client and cache.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,                   // on failure, try once more then give up
      refetchOnWindowFocus: true, // refetch when user switches back to the tab
    },
  },
})

// ── Render ────────────────────────────────────────────────────
// QueryClientProvider makes the queryClient available to every
// component. RouterProvider boots the router and renders the
// correct route based on the current URL.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </React.StrictMode>
)