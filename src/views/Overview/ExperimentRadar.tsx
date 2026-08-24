import type { Experiment } from '../../types/data-contract'
import { fmtDate, fmtPct } from '../../lib/format'
import { useNavigate } from '../../lib/router'
import type { Route } from '../../lib/router'
import './ExperimentRadar.css'

interface Props {
  experiments: Experiment[]
  loading: boolean
}

const MATURITY_META = {
  'collecting':      { label: 'Collecting data', className: 'chip--neutral' },
  'directional':     { label: 'Directional',     className: 'chip--directional' },
  'decision-ready':  { label: 'Decision ready',  className: 'chip--completed' },
}

const GUARDRAIL_META = {
  'healthy':  { label: 'Guardrails OK', icon: '✓', color: 'var(--color-positive)' },
  'watch':    { label: 'Guardrail watch', icon: '△', color: 'var(--color-caution)' },
  'tripped':  { label: 'Guardrail tripped', icon: '!', color: 'var(--color-critical)' },
  'n/a':      { label: '—', icon: '—', color: 'var(--text-tertiary)' },
}

export default function ExperimentRadar({ experiments, loading }: Props) {
  const navigate = useNavigate()

  if (loading) {
    return (
      <div className="experiment-radar">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: '140px', borderRadius: 'var(--radius-lg)' }}/>
        ))}
      </div>
    )
  }

  if (experiments.length === 0) {
    return (
      <div className="experiment-radar__empty" aria-live="polite">
        <p className="experiment-radar__empty-text">No live experiments</p>
      </div>
    )
  }

  return (
    <div className="experiment-radar" role="list">
      {experiments.map(exp => {
        const maturity = MATURITY_META[exp.maturity]
        const guardrail = GUARDRAIL_META[exp.guardrailState]
        const lift = exp.primaryMetric.observedLift

        return (
          <article
            key={exp.id}
            className="exp-card"
            role="listitem"
            aria-labelledby={`exp-${exp.id}-name`}
            onClick={() => navigate('/experiments' as Route)}
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && navigate('/experiments' as Route)}
            style={{ cursor: 'pointer' }}
          >
            <header className="exp-card__header">
              <div className="exp-card__title-row">
                <span className="chip chip--live" role="img" aria-label="Live">
                  <span className="exp-live-dot" aria-hidden="true"/>
                  Live
                </span>
                <h3 id={`exp-${exp.id}-name`} className="exp-card__name">
                  {exp.name}
                </h3>
              </div>
              <span className={`chip ${maturity.className}`}>
                {maturity.label}
              </span>
            </header>

            <p className="exp-card__hypothesis">{exp.hypothesis}</p>

            <div className="exp-card__stats">
              <div className="exp-card__stat">
                <span className="exp-card__stat-label">Primary metric</span>
                <span className="exp-card__stat-value">{exp.primaryMetric.label}</span>
              </div>

              {lift !== null && (
                <div className="exp-card__stat">
                  <span className="exp-card__stat-label">Observed lift</span>
                  <span
                    className={`exp-card__stat-value exp-card__lift exp-card__lift--${exp.primaryMetric.direction ?? 'flat'}`}
                  >
                    {lift >= 0 ? '+' : ''}{fmtPct(lift)}
                    <span className="exp-card__uncertainty" aria-label="data maturity: not yet statistically confirmed">
                      {exp.maturity !== 'decision-ready' ? '*' : ''}
                    </span>
                  </span>
                </div>
              )}

              {exp.rolloutPct !== null && (
                <div className="exp-card__stat">
                  <span className="exp-card__stat-label">Exposure</span>
                  <span className="exp-card__stat-value">{exp.rolloutPct}% rollout</span>
                </div>
              )}

              <div className="exp-card__stat">
                <span className="exp-card__stat-label">Guardrails</span>
                <span
                  className="exp-card__stat-value"
                  style={{ color: guardrail.color }}
                  aria-label={guardrail.label}
                >
                  <span aria-hidden="true">{guardrail.icon}</span>
                  {' '}{guardrail.label}
                </span>
              </div>

              {exp.decisionDate && (
                <div className="exp-card__stat">
                  <span className="exp-card__stat-label">Decision date</span>
                  <span className="exp-card__stat-value">{fmtDate(exp.decisionDate)}</span>
                </div>
              )}
            </div>

            {exp.maturity === 'decision-ready' && (
              <div className="exp-card__decision-ready">
                Ready for decision — review in Experiments
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}
