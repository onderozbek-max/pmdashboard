import type { ActivationDataset } from '../../types/data-contract'
import { fmtCount, fmtPct, fmtDecimal } from '../../lib/format'
import './ActivationFunnel.css'

interface Props { activation: ActivationDataset }

export default function ActivationFunnel({ activation }: Props) {
  const { steps } = activation
  const maxW = steps[0]?.count ?? 1

  return (
    <div className="activation-funnel">
      <div className="activation-heading-row">
        <h2 className="activation-title">New Member Activation</h2>
        <p className="activation-sub">
          Cohort: {activation.cohortLabel} — {fmtCount(activation.newMembersThisPeriod)} new members
        </p>
      </div>

      {/* Summary stats */}
      <div className="activation-stats">
        <div className="activation-stat">
          <span className="activation-stat__label">Join Flow Completion</span>
          <span className="activation-stat__value">{fmtPct(activation.joinFlowCompletionRate)}</span>
        </div>
        <div className="activation-stat">
          <span className="activation-stat__label">Onboarding Completion</span>
          <span className="activation-stat__value">{fmtPct(activation.onboardingCompletionRate)}</span>
        </div>
        <div className="activation-stat">
          <span className="activation-stat__label">Median Days to First Activity</span>
          <span className="activation-stat__value">{fmtDecimal(activation.medianDaysToFirstParticipation)}d</span>
        </div>
        <div className="activation-stat">
          <span className="activation-stat__label">First Research Activity Rate</span>
          <span className="activation-stat__value">{fmtPct(activation.firstResearchActivityCompletionRate)}</span>
        </div>
      </div>

      {/* Funnel visualization */}
      <div className="funnel-visual" role="img" aria-label="Activation funnel">
        <table className="sr-only">
          <thead>
            <tr><th>Step</th><th>Members</th><th>From start</th><th>From prior</th></tr>
          </thead>
          <tbody>
            {steps.map(s => (
              <tr key={s.step}>
                <td>{s.step}</td>
                <td>{fmtCount(s.count)}</td>
                <td>{fmtPct(s.conversionFromTop)}</td>
                <td>{fmtPct(s.conversionFromPrior)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="funnel-steps" aria-hidden="true">
          {steps.map((step, i) => {
            const pct = step.count / maxW
            const isLastStep = i === steps.length - 1
            const isDropOff = i > 0 && step.conversionFromPrior < 0.75

            return (
              <div key={step.step} className="funnel-step-row">
                <div className="funnel-step-label">
                  <span className="funnel-step-name">{step.step}</span>
                  {step.medianDaysFromJoin !== undefined && (
                    <span className="funnel-step-timing">~{fmtDecimal(step.medianDaysFromJoin)}d from join</span>
                  )}
                </div>
                <div className="funnel-bar-area">
                  <div
                    className={`funnel-bar ${isDropOff ? 'funnel-bar--warn' : ''}`}
                    style={{
                      width: `${pct * 100}%`,
                      background: isLastStep ? 'var(--chart-3)' : 'var(--chart-1)',
                    }}
                  />
                  <span className="funnel-count">{fmtCount(step.count)}</span>
                  {i > 0 && (
                    <span className={`funnel-conv ${isDropOff ? 'funnel-conv--warn' : ''}`}>
                      {fmtPct(step.conversionFromPrior)} from prior
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
