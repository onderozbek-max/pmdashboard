import type { ParticipationDepthDataset } from '../../types/data-contract'
import { fmtCount, fmtPct, fmtDecimal } from '../../lib/format'
import { HIGHLY_ENGAGED_THRESHOLD } from '../../metrics/definitions'
import './DepthChart.css'

interface Props { depth: ParticipationDepthDataset }

export default function DepthChart({ depth }: Props) {
  const { buckets, activitiesPerActiveMember } = depth
  const maxCount = Math.max(...buckets.map(b => b.count))

  return (
    <div className="depth-chart">
      <div className="depth-heading-row">
        <h2 className="depth-title">Participation Depth</h2>
        <p className="depth-sub">
          Distribution of active members by activity frequency. Members completing {HIGHLY_ENGAGED_THRESHOLD}+
          activities/month are Highly Engaged.
        </p>
      </div>

      <div className="depth-summary">
        <div className="depth-stat">
          <span className="depth-stat__label">Avg Activities / Active Member</span>
          <span className="depth-stat__value">{fmtDecimal(activitiesPerActiveMember)}</span>
        </div>
        <div className="depth-stat">
          <span className="depth-stat__label">Highly Engaged (5+)</span>
          <span className="depth-stat__value">
            {fmtPct(
              buckets
                .filter(b => b.isHighlyEngaged)
                .reduce((s, b) => s + b.shareOfActive, 0)
            )} of MAU
          </span>
        </div>
      </div>

      {/* Accessible table */}
      <table className="sr-only" aria-label="Participation depth distribution">
        <thead>
          <tr>
            <th>Bucket</th>
            <th>Members</th>
            <th>Share of Active</th>
            <th>Highly Engaged?</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map(b => (
            <tr key={b.label}>
              <td>{b.label}</td>
              <td>{fmtCount(b.count)}</td>
              <td>{fmtPct(b.shareOfActive)}</td>
              <td>{b.isHighlyEngaged ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Visual bars */}
      <div className="depth-bars" aria-hidden="true">
        {buckets.map(b => {
          const barH = (b.count / maxCount) * 200
          return (
            <div key={b.label} className={`depth-bar-col ${b.isHighlyEngaged ? 'depth-bar-col--engaged' : ''}`}>
              <div className="depth-bar-value">
                <span className="depth-bar-count">{fmtCompact(b.count)}</span>
                <span className="depth-bar-pct">{fmtPct(b.shareOfActive)}</span>
              </div>
              <div className="depth-bar-bg">
                <div
                  className="depth-bar"
                  style={{
                    height: `${barH}px`,
                    background: b.isHighlyEngaged ? 'var(--chart-3)' : 'var(--chart-1)',
                  }}
                />
              </div>
              <span className="depth-bar-label">{b.label}</span>
              {b.isHighlyEngaged && (
                <span className="depth-bar-he-tag">Highly Engaged</span>
              )}
            </div>
          )
        })}
      </div>

      <p className="depth-threshold-note">
        Highly Engaged threshold: {HIGHLY_ENGAGED_THRESHOLD}+ activities/month (shown in green)
      </p>
    </div>
  )
}

function fmtCompact(n: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}
