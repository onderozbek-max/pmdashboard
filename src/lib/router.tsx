/**
 * Minimal hash-based router — replaces react-router-dom.
 * Supports 4 fixed routes. Zero external dependencies.
 * Uses window.location.hash for GitHub Pages compatibility.
 */

import {
  createContext, useContext, useState, useEffect, useCallback,
  type ReactNode,
} from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type Route = '/overview' | '/members' | '/activities' | '/experiments'

interface RouterContextValue {
  currentPath: Route
  navigate: (path: Route) => void
}

// ─── Context ─────────────────────────────────────────────────────────────────

const RouterContext = createContext<RouterContextValue | null>(null)

export function useRouter(): RouterContextValue {
  const ctx = useContext(RouterContext)
  if (!ctx) throw new Error('useRouter must be used within HashRouter')
  return ctx
}

export function useNavigate() {
  return useRouter().navigate
}

// ─── Hash parsing ─────────────────────────────────────────────────────────────

const VALID_ROUTES: Route[] = ['/overview', '/members', '/activities', '/experiments']

function parseHash(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/overview'
  // Normalize to just the first path segment for our 4-route app
  const path = '/' + (raw.replace(/^\//, '').split('/')[0] ?? 'overview')
  return (VALID_ROUTES.includes(path as Route) ? path : '/overview') as Route
}

// ─── Provider ────────────────────────────────────────────────────────────────

interface HashRouterProps { children: ReactNode }

export function HashRouter({ children }: HashRouterProps) {
  const [currentPath, setCurrentPath] = useState<Route>(parseHash)

  useEffect(() => {
    const onHashChange = () => setCurrentPath(parseHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const navigate = useCallback((path: Route) => {
    window.location.hash = `#${path}`
    setCurrentPath(path)
  }, [])

  return (
    <RouterContext.Provider value={{ currentPath, navigate }}>
      {children}
    </RouterContext.Provider>
  )
}

// ─── Components ───────────────────────────────────────────────────────────────

interface RouteProps {
  path: Route
  element: ReactNode
}

interface RoutesProps { children: ReactNode }

export function Routes({ children }: RoutesProps) {
  const { currentPath } = useRouter()

  // Children are Route elements; render the one whose path matches
  const nodes = Array.isArray(children) ? children : [children]
  for (const child of nodes as React.ReactElement<RouteProps>[]) {
    if (child?.props?.path === currentPath) {
      return <>{child.props.element}</>
    }
  }
  // Default: redirect to overview
  return null
}

export function RouteEl({ element }: RouteProps) {
  return <>{element}</>
}

interface NavLinkProps {
  to: Route
  children: ReactNode | ((args: { isActive: boolean }) => ReactNode)
  className?: string | ((args: { isActive: boolean }) => string)
  'aria-current'?: 'page' | undefined
  onClick?: () => void
}

export function NavLink({ to, children, className, ...rest }: NavLinkProps) {
  const { currentPath, navigate } = useRouter()
  const isActive = currentPath === to

  const resolvedClass =
    typeof className === 'function' ? className({ isActive }) : className ?? ''

  const resolvedChildren =
    typeof children === 'function' ? children({ isActive }) : children

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    navigate(to)
  }

  return (
    <a
      href={`#${to}`}
      className={resolvedClass}
      aria-current={isActive ? 'page' : undefined}
      onClick={handleClick}
      {...rest}
    >
      {resolvedChildren}
    </a>
  )
}
