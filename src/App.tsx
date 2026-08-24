import { useState, useEffect, createContext, useContext, useCallback } from 'react'
import { HashRouter, Routes, RouteEl as Route } from './lib/router'
import type { Route as RoutePath } from './lib/router'
import { loadAllData, type DataBundle } from './data/loader'
import Nav from './components/layout/Nav'
import OverviewPage from './views/Overview/OverviewPage'
import MembersPage from './views/Members/MembersPage'
import ActivitiesPage from './views/Activities/ActivitiesPage'
import ExperimentsPage from './views/Experiments/ExperimentsPage'

// ─── Data context ─────────────────────────────────────────────────────────────

interface DataContextValue {
  bundle: DataBundle | null
  loading: boolean
  period: string
  setPeriod: (p: string) => void
  theme: 'light' | 'dark'
  toggleTheme: () => void
}

const DataContext = createContext<DataContextValue | null>(null)

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataContext')
  return ctx
}

// ─── Theme persistence ────────────────────────────────────────────────────────

function getInitialTheme(): 'light' | 'dark' {
  const stored = localStorage.getItem('mmc-theme')
  if (stored === 'dark' || stored === 'light') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [bundle, setBundle] = useState<DataBundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('1m')
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('mmc-theme', theme)
  }, [theme])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    loadAllData().then(b => {
      if (!cancelled) { setBundle(b); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(t => t === 'light' ? 'dark' : 'light')
  }, [])

  const isSynthetic = bundle?.manifest.ok && bundle.manifest.data.source === 'synthetic'

  return (
    <DataContext.Provider value={{ bundle, loading, period, setPeriod, theme, toggleTheme }}>
      <HashRouter>
        <div className="app-shell">
          {isSynthetic && (
            <div
              role="status"
              aria-live="polite"
              className="synthetic-banner"
              style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 300 }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 11.5A.75.75 0 118 11a.75.75 0 010 1.5zm.75-3.75a.75.75 0 01-1.5 0v-4a.75.75 0 011.5 0v4z"/>
              </svg>
              Demonstration data — not real metrics
            </div>
          )}

          <Nav theme={theme} onToggleTheme={toggleTheme} />

          <main
            id="main-content"
            className="main-content"
            style={{ paddingTop: isSynthetic ? '36px' : 0 }}
          >
            <Routes>
              <Route path="/overview"    element={<OverviewPage />} />
              <Route path="/members"     element={<MembersPage />} />
              <Route path="/activities"  element={<ActivitiesPage />} />
              <Route path="/experiments" element={<ExperimentsPage />} />
            </Routes>
          </main>
        </div>
      </HashRouter>
    </DataContext.Provider>
  )
}

// Re-export RoutePath so consumers can use it without importing from lib/router
export type { RoutePath }
