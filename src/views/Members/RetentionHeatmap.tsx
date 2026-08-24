import type { RetentionDataset, CohortRow } from '../../types/data-contract'
import { fmtMonthLabel, fmtPct } from '../../lib/format'
import { clamp } from '../../lib/format'
import './RetentionHeatmap.css'

interface Props { retention: RetentionDataset }

const WEEKS: Array<keyof CohortRow> = ['w1', 'w2', 'w4', 'w8', 'w12']
const WEEK_LABELS = ['W1', 'W2', 'W4', 'W8', 'W12']

function retentionColor(value: number | null): string {
  if (value === null) return 'transparent'
  const pct = clamp(value, 0, 1)
  // Heat from cool (low) to warm (high)
  // Map to blue intensity in light mode, opacity in dark
  return `rgba(59, 130, 246, ${0.1 + pct * 0.85})`
}

function textColor(value: number | null): string {
  if (value === null) return 'var(--text-tertiary)'
  return value > 0.5 ? '#fff' : 'var(--text-primary)'
}

export default function RetentionHeatmap({ retention }: Props) {
  const { cohorts, medianW2Retention, medianW4Retention } = retention
  // Most recent 8 cohorts max for readability
  const visible = cohorts.slice(-8)

  return (
    <div className="retention-heatmap">
      <div className="retention-heading-row">
        <h2 className="retention-title">Cohort Participation Retention</h2>
        <p className="retention-sub">
          Percentage of cohort members who participated again at each week interval.
        </p>
      </div>

      {/* Summary */}
      <div className="retention-summary">
        <div className="retention-summary-stat">
          <span className="retention-summary-stat__label">Median W2 Retention</span>
          <span className="retention-summary-stat__value">{fmtPct(medianW2Retention)}</span>
        </div>
        <div className="retention-summary-stat">
          <span className="retention-summary-stat__label">Median W4 Retention</span>
          <span className="retention-summary-stat__value">{fmtPct(medianW4Retention)}</span>
        </div>
      </div>

      {/* Heatmap */}
      <div className="heatmap-wrapper">
        <table
          className="heatmap-table"
          aria-label="Cohort retention heatmap — percentage of cohort returning by week"
        >
          <thead>
            <tr>
              <th scope="col" className="heatmap-cohort-col">Cohort</th>
              <th scope="col" className="heatmap-size-col">Size</th>
              {WEEK_LABELS.map(w => (
                <th key={w} scope="col" className="heatmap-week-col">{w}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map(cohort => (
              <tr key={cohort.cohortLabel}>
                <th scope="row" className="heatmap-cohort-label">
                  {fmtMonthLabel(cohort.cohortLabel)}
                </th>
                <td className="heatmap-size">
                  {cohort.startSize.toLocaleString()}
                </td>
                {WEEKS.map((week, wi) => {
                  const val = cohort[week] as number | null
                  return (
                    <td
                      key={week}
                      className="heatmap-cell"
                      style={{
                        background: retentionColor(val),
                        color: val !== null ? textColor(val) : undefined,
                      }}
                      aria-label={
                        val !== null
                          ? `${fmtMonthLabel(cohort.cohortLabel)} ${WEEK_LABELS[wi]}: ${fmtPct(val)}`
                          : `${fmtMonthLabel(cohort.cohortLabel)} ${WEEK_LABELS[wi]}: data not yet available`
                      }
                    >
                      {val !== null ? fmtPct(val) : <span aria-hidden="true">—</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="heatmap-legend" aria-hidden="true">
        <span className="heatmap-legend__label">Lower retention</span>
        <div className="heatmap-legend__gradient"/>
        <span className="heatmap-legend__label">Higher retention</span>
        <span className="heatmap-legend__null">— = not yet available</span>
      </div>
    </div>
  )
}
