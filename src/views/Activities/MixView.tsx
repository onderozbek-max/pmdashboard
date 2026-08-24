import type { ActivityMixDataset } from '../../types/data-contract'
import { fmtPct } from '../../lib/format'
import './MixView.css'

interface Props { mix: ActivityMixDataset }

const COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
]

export default function MixView({ mix }: Props) {
  const { types } = mix

  return (
    <div className="mix-view">
      <div className="mix-heading-row">
        <h2 className="mix-title">Activity Mix</h2>
        <p className="mix-sub">
          Is participation diversified or dominated by a single format?
          Compare supply share vs. completion share to identify over- and under-utilized types.
        </p>
      </div>

      {/* Accessible table */}
      <table className="mix-table" aria-label="Activity mix: supply share vs completion share">
        <thead>
          <tr>
            <th scope="col">Activity Type</th>
            <th scope="col">Supply Share</th>
            <th scope="col">Completion Share</th>
            <th scope="col">vs. Supply</th>
          </tr>
        </thead>
        <tbody>
          {types.map((type, i) => {
            const diff = type.completionShare - type.supplyShare
            const isOver = diff > 0.02
            const isUnder = diff < -0.02

            return (
              <tr key={type.key}>
                <th scope="row" className="mix-table__type">
                  <span className="mix-table__dot" style={{ background: COLORS[i % COLORS.length] }}/>
                  {type.label}
                </th>
                <td className="mix-table__bar-cell">
                  <div className="mix-table__bar-row">
                    <div
                      className="mix-table__bar mix-table__bar--supply"
                      style={{ width: `${type.supplyShare * 100}%` }}
                    />
                    <span className="mix-table__pct">{fmtPct(type.supplyShare)}</span>
                  </div>
                </td>
                <td className="mix-table__bar-cell">
                  <div className="mix-table__bar-row">
                    <div
                      className="mix-table__bar mix-table__bar--completion"
                      style={{ width: `${type.completionShare * 100}%`, background: COLORS[i % COLORS.length] }}
                    />
                    <span className="mix-table__pct">{fmtPct(type.completionShare)}</span>
                  </div>
                </td>
                <td
                  className={`mix-table__diff ${isOver ? 'mix-table__diff--over' : isUnder ? 'mix-table__diff--under' : ''}`}
                >
                  {diff >= 0 ? '+' : ''}{fmtPct(diff)}
                  <span className="sr-only">
                    {isOver ? 'over-represented in completions' :
                     isUnder ? 'under-represented in completions' :
                     'proportionate'}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <p className="mix-note">
        "vs. Supply" shows whether a type's share of completions is higher (+) or lower (−) than its share of supply.
        Large differences may indicate over-promotion or friction.
      </p>
    </div>
  )
}
