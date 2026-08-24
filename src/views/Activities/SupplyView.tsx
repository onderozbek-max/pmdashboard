import type { ActivitySupplyDataset } from '../../types/data-contract'
import { fmtCount, fmtPct, fmtDecimal } from '../../lib/format'
import LineChart from '../../components/charts/LineChart'
import './SupplyView.css'

interface Props { supply: ActivitySupplyDataset }

export default function SupplyView({ supply }: Props) {
  const coveragePct = supply.activitySupplyCoverage
  const isLow = coveragePct < 0.80

  return (
    <div className="supply-view">
      <div className="supply-heading-row">
        <h2 className="supply-title">Activity Supply</h2>
        <p className="supply-sub">
          Distinguishes participation-demand problems from participation-supply problems.
          Low coverage means members lack eligible activities — not necessarily that demand is low.
        </p>
      </div>

      <div className="supply-stats">
        <div className={`supply-stat ${isLow ? 'supply-stat--warn' : ''}`}>
          <span className="supply-stat__label">Activity Supply Coverage</span>
          <span className="supply-stat__value">{fmtPct(coveragePct)}</span>
          <span className="supply-stat__note">
            {isLow
              ? `${fmtPct(supply.membersWithZeroAvailablePct)} of active members have zero eligible activities`
              : 'Most active members have at least one eligible activity'}
          </span>
        </div>
        <div className="supply-stat">
          <span className="supply-stat__label">Eligible Activities per Member</span>
          <span className="supply-stat__value">{fmtDecimal(supply.eligibleActivitiesPerMember)}</span>
          <span className="supply-stat__note">Average in current week</span>
        </div>
        <div className={`supply-stat ${supply.membersWithZeroAvailablePct > 0.2 ? 'supply-stat--warn' : ''}`}>
          <span className="supply-stat__label">Members with Zero Available</span>
          <span className="supply-stat__value">{fmtCount(supply.membersWithZeroAvailable)}</span>
          <span className="supply-stat__note">{fmtPct(supply.membersWithZeroAvailablePct)} of MAU</span>
        </div>
      </div>

      {isLow && (
        <div className="supply-alert" role="alert">
          <strong>Supply constraint detected:</strong> Activity Supply Coverage at {fmtPct(coveragePct)} is below the 80% threshold.
          Participation-rate changes may reflect supply limitations rather than reduced member demand.
        </div>
      )}

      {/* Trend chart */}
      <div className="surface surface--elevated" style={{ padding: 'var(--space-5)' }}>
        <h3 className="supply-chart-title">Supply Coverage Over Time</h3>
        <LineChart
          title="Activity Supply Coverage"
          series={[
            {
              key: 'coverage',
              label: 'Supply Coverage',
              data: supply.history.map(h => ({ date: h.date, value: h.coveragePct })),
              color: 'var(--chart-1)',
            },
          ]}
          height={200}
          unit="pct"
        />
      </div>

      {/* Eligible per member trend */}
      <div className="surface surface--elevated" style={{ padding: 'var(--space-5)' }}>
        <h3 className="supply-chart-title">Eligible Activities per Member</h3>
        <LineChart
          title="Eligible Activities per Member"
          series={[
            {
              key: 'eligible',
              label: 'Eligible / Member',
              data: supply.history.map(h => ({ date: h.date, value: h.eligiblePerMember })),
              color: 'var(--chart-2)',
            },
          ]}
          height={180}
        />
      </div>
    </div>
  )
}
