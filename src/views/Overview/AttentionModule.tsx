import type { AttentionItem } from '../../lib/insights'
import { useNavigate } from '../../lib/router'
import type { Route } from '../../lib/router'
import './AttentionModule.css'

interface Props {
  items: AttentionItem[]
  loading: boolean
}

const STATUS_META = {
  healthy:  { icon: '✓', label: 'Healthy',        className: 'attention-item--healthy' },
  watch:    { icon: '△', label: 'Watch',          className: 'attention-item--watch' },
  critical: { icon: '!', label: 'Needs Attention', className: 'attention-item--critical' },
}

export default function AttentionModule({ items, loading }: Props) {
  const navigate = useNavigate()
  const allHealthy = !loading && items.length === 0

  if (loading) {
    return (
      <div className="attention-module" aria-label="Loading needs attention section" aria-busy="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: '52px', borderRadius: 'var(--radius-md)' }}/>
        ))}
      </div>
    )
  }

  if (allHealthy) {
    return (
      <div className="attention-module attention-module--healthy" role="status" aria-live="polite">
        <div className="attention-all-healthy">
          <span className="attention-all-healthy__icon" aria-hidden="true">✓</span>
          <div>
            <p className="attention-all-healthy__title">All metrics healthy</p>
            <p className="attention-all-healthy__sub">No P0 metrics require immediate attention.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="attention-module">
      <ul className="attention-list" role="list">
        {items.map(item => {
          const meta = STATUS_META[item.status]
          return (
            <li key={item.metricKey}>
              <button
                className={`attention-item ${meta.className}`}
                onClick={() => navigate(`/${item.view}` as Route)}
                aria-label={`${item.label}: ${meta.label} — ${item.note}. Navigate to ${item.view}`}
              >
                <span className="attention-item__icon" aria-label={meta.label} role="img">
                  {meta.icon}
                </span>
                <div className="attention-item__content">
                  <span className="attention-item__metric">{item.label}</span>
                  <span className="attention-item__note">{item.note}</span>
                </div>
                <span className={`attention-item__badge ${item.status === 'critical' ? 'chip--critical' : 'chip--watch'}`}>
                  {item.statusLabel}
                </span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                  <path d="M4 2l4 4-4 4"/>
                </svg>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
