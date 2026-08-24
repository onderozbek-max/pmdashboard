import type { MemberLifecycleDataset } from '../../types/data-contract'
import { fmtCount, fmtPct } from '../../lib/format'
import './MemberJourney.css'

interface Props { lifecycle: MemberLifecycleDataset }

export default function MemberJourney({ lifecycle }: Props) {
  const { stages } = lifecycle
  const topCount = stages[0]?.count ?? 1

  return (
    <div className="member-journey">
      <div className="member-journey__heading-row">
        <h2 className="member-journey__title">Member Lifecycle</h2>
        <p className="member-journey__sub">
          From joining to highly engaged — where does the Community retain and lose members?
        </p>
      </div>

      {/* Accessible table version */}
      <table className="sr-only" aria-label="Member lifecycle data table">
        <thead>
          <tr>
            <th>Stage</th>
            <th>Count</th>
            <th>% of Joined</th>
          </tr>
        </thead>
        <tbody>
          {stages.map(s => (
            <tr key={s.stage}>
              <td>{s.stage}</td>
              <td>{fmtCount(s.count)}</td>
              <td>{fmtPct(s.count / topCount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Visual journey */}
      <div className="journey-steps" aria-hidden="true">
        {stages.map((stage, i) => {
          const prev = stages[i - 1]
          const convPrev = prev ? stage.count / prev.count : 1
          const convTop = stage.count / topCount
          const barW = `${convTop * 100}%`
          const isDropOff = convPrev < 0.8

          return (
            <div key={stage.stage} className="journey-step">
              {i > 0 && (
                <div className={`journey-step__connector ${isDropOff ? 'journey-step__connector--warn' : ''}`}>
                  <span className="journey-step__conv">
                    {fmtPct(convPrev)} retained
                  </span>
                </div>
              )}

              <div className="journey-step__card">
                <div className="journey-step__meta">
                  <span className="journey-step__label">{stage.stage}</span>
                  <span className="journey-step__count">{fmtCount(stage.count)}</span>
                  {i > 0 && (
                    <span className="journey-step__pct-top">
                      {fmtPct(convTop)} of total
                    </span>
                  )}
                </div>
                <div className="journey-step__bar-bg">
                  <div
                    className="journey-step__bar"
                    style={{
                      width: barW,
                      background: i === 0 ? 'var(--chart-1)' :
                                  i === stages.length - 1 ? 'var(--chart-3)' :
                                  'var(--chart-2)',
                    }}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
