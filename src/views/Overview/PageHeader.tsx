import { useData } from '../../App'
import { unwrap } from '../../data/loader'
import { fmtDate, fmtRelativeTime } from '../../lib/format'
import './PageHeader.css'

export default function PageHeader() {
  const { bundle, loading } = useData()
  const manifest = bundle ? unwrap(bundle.manifest) : null

  const dataThrough = manifest?.dataThrough
  const generatedAt = manifest?.generatedAt
  const thresholdHours = manifest?.freshnessThresholdHours ?? 72

  // Staleness check
  const isStale = (() => {
    if (!generatedAt) return false
    const generated = new Date(generatedAt)
    const now = Date.now()
    const diffH = (now - generated.getTime()) / (1000 * 60 * 60)
    return diffH > thresholdHours
  })()

  return (
    <header className="page-header">
      <div className="page-header__main">
        <div className="page-header__titles">
          <h1 className="page-header__h1">Member's Mark Community</h1>
          <p className="page-header__sub">Product Dashboard</p>
        </div>

        <div className="page-header__meta">
          {!loading && manifest && (
            <>
              <div className="page-header__meta-item">
                <span className="page-header__meta-label">Data through</span>
                <span className="page-header__meta-value">
                  {dataThrough ? fmtDate(dataThrough) : '—'}
                </span>
              </div>
              <div className="page-header__meta-sep" aria-hidden="true"/>
              <div className="page-header__meta-item">
                <span className="page-header__meta-label">Updated</span>
                <span className={`page-header__meta-value ${isStale ? 'page-header__meta-value--stale' : ''}`}>
                  {generatedAt ? fmtRelativeTime(generatedAt) : '—'}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {isStale && (
        <div className="stale-warning" role="alert">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 11.5A.75.75 0 118 11a.75.75 0 010 1.5zm.75-3.75a.75.75 0 01-1.5 0v-4a.75.75 0 011.5 0v4z"/>
          </svg>
          Data is more than {thresholdHours} hours old. The batch process may not have run.
        </div>
      )}
    </header>
  )
}
