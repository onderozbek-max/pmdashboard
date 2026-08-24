import { useState } from 'react'
import type { ActivityPerformanceDataset } from '../../types/data-contract'
import { fmtPct, fmtCount } from '../../lib/format'
import './PerformanceView.css'

interface Props { performance: ActivityPerformanceDataset }

type SortKey = 'label' | 'completionRate' | 'totalCompleted' | 'totalAvailable'
type SortDir = 'asc' | 'desc'

export default function PerformanceView({ performance }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('completionRate')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const sorted = [...performance.types].sort((a, b) => {
    const av = a[sortKey]
    const bv = b[sortKey]
    if (typeof av === 'string' && typeof bv === 'string') {
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    }
    return sortDir === 'asc'
      ? (av as number) - (bv as number)
      : (bv as number) - (av as number)
  })

  const maxRate = Math.max(...performance.types.map(t => t.completionRate))

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  function sortIcon(key: SortKey) {
    if (key !== sortKey) return <span aria-hidden="true" style={{ opacity: 0.3 }}>⇅</span>
    return <span aria-hidden="true">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  return (
    <div className="perf-view">
      <div className="perf-heading-row">
        <h2 className="perf-title">Performance by Activity Type</h2>
        <p className="perf-sub">
          Completion rates by activity type. Large differences between types indicate where supply
          or format quality may need attention.
        </p>
      </div>

      <div className="perf-table-wrap">
        <table className="perf-table" aria-label="Activity performance by type">
          <thead>
            <tr>
              <th scope="col">
                <button className="sort-btn" onClick={() => handleSort('label')} aria-label="Sort by activity type">
                  Activity Type {sortIcon('label')}
                </button>
              </th>
              <th scope="col">
                <button className="sort-btn" onClick={() => handleSort('totalAvailable')} aria-label="Sort by available">
                  Available {sortIcon('totalAvailable')}
                </button>
              </th>
              <th scope="col">
                <button className="sort-btn" onClick={() => handleSort('totalCompleted')} aria-label="Sort by completed">
                  Completed {sortIcon('totalCompleted')}
                </button>
              </th>
              <th scope="col">
                <button className="sort-btn" onClick={() => handleSort('completionRate')} aria-label="Sort by completion rate">
                  Completion Rate {sortIcon('completionRate')}
                </button>
              </th>
              <th scope="col" aria-hidden="true">Rate bar</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(type => {
              const barW = (type.completionRate / maxRate) * 100
              const isHigh = type.completionRate > 0.75
              const isLow  = type.completionRate < 0.45
              return (
                <tr key={type.key}>
                  <th scope="row" className="perf-type-label">
                    {type.label}
                  </th>
                  <td className="perf-num">{fmtCount(type.totalAvailable)}</td>
                  <td className="perf-num">{fmtCount(type.totalCompleted)}</td>
                  <td className={`perf-rate ${isHigh ? 'perf-rate--high' : isLow ? 'perf-rate--low' : ''}`}>
                    {fmtPct(type.completionRate)}
                    <span className="sr-only">
                      {isHigh ? ' (high)' : isLow ? ' (low)' : ''}
                    </span>
                  </td>
                  <td className="perf-bar-cell" aria-hidden="true">
                    <div className="perf-bar-bg">
                      <div
                        className="perf-bar"
                        style={{
                          width: `${barW}%`,
                          background: isHigh ? 'var(--color-positive)' :
                                      isLow  ? 'var(--color-caution)' :
                                      'var(--chart-1)',
                        }}
                      />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="perf-note">
        Completion rate = completed ÷ available. Quick Polls and Trivia typically show lower rates due to higher supply volume.
      </p>
    </div>
  )
}
