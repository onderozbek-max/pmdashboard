import { useState } from 'react'
import type { Experiment } from '../../types/data-contract'
import { fmtDate, fmtPct, fmtCount } from '../../lib/format'
import './ExperimentCard.css'

interface Props { experiment: Experiment }

const DECISION_META: Record<string, { label: string; className: string }> = {
  ship:     { label: 'Ship',              className: 'decision--ship' },
  iterate:  { label: 'Iterate',           className: 'decision--iterate' },
  stop:     { label: 'Stop',              className: 'decision--stop' },
  continue: { label: 'Continue collecting', className: 'decision--continue' },
}

const MATURITY_META: Record<string, { label: string; className: string }> = {
  'collecting':     { label: 'Collecting data', className: 'chip--neutral' },
  'directional':    { label: 'Directional',     className: 'chip--directional' },
  'decision-ready': { label: 'Decision ready',  className: 'chip--completed' },
}

const GUARDRAIL_META: Record<string, { icon: string; label: string; color: string }> = {
  'healthy':  { icon: '✓', label: 'Guardrails healthy', color: 'var(--color-positive)' },
  'watch':    { icon: '△', label: 'Guardrail watch',    color: 'var(--color-caution)' },
  'tripped':  { icon: '!', label: 'Guardrail tripped',  color: 'var(--color-critical)' },
  'n/a':      { icon: '—', label: 'No guardrails set',  color: 'var(--text-tertiary)' },
}

export default function ExperimentCard({ experiment: exp }: Props) {
  const [expanded, setExpanded] = useState(false)
  const maturity = MATURITY_META[exp.maturity]
  const guardrail = GUARDRAIL_META[exp.guardrailState]
  const decision = exp.decision ? DECISION_META[exp.decision] : null

  const isCompleted = exp.status === 'completed'
  const isLive = exp.status === 'live'

  return (
    <article
      className={`experiment-card experiment-card--${exp.status}`}
      role="listitem"
      aria-labelledby={`exp-name-${exp.id}`}
    >
      {/* Header */}
      <header className="experiment-card__header">
        <div className="experiment-card__title-row">
          <h2 id={`exp-name-${exp.id}`} className="experiment-card__name">
            {exp.name}
          </h2>
          <span className={`chip ${maturity.className}`}>{maturity.label}</span>
          {decision && (
            <span className={`decision-badge ${decision.className}`}>{decision.label}</span>
          )}
        </div>

        <div className="experiment-card__meta">
          <span className="experiment-card__date">
            Started {fmtDate(exp.startDate)}
            {exp.endDate && ` — Ended ${fmtDate(exp.endDate)}`}
          </span>
          {exp.decisionDate && !isCompleted && (
            <span className="experiment-card__decision-date">
              Decision: {fmtDate(exp.decisionDate)}
            </span>
          )}
        </div>
      </header>

      {/* Hypothesis */}
      <div className="experiment-card__hypothesis-block">
        <span className="experiment-card__block-label">Hypothesis</span>
        <p className="experiment-card__hypothesis">{exp.hypothesis}</p>
      </div>

      {/* Stats grid */}
      <div className="experiment-card__stats">
        {/* Primary metric */}
        <div className="experiment-card__stat experiment-card__stat--primary">
          <span className="experiment-card__stat-label">Primary Metric</span>
          <span className="experiment-card__stat-metric">{exp.primaryMetric.label}</span>
          {exp.primaryMetric.observedLift !== null && (
            <div className="experiment-card__lift-row">
              <span
                className={`experiment-card__lift experiment-card__lift--${exp.primaryMetric.direction ?? 'flat'}`}
              >
                {exp.primaryMetric.observedLift >= 0 ? '+' : ''}{fmtPct(exp.primaryMetric.observedLift)}
              </span>
              <span className="experiment-card__sig">
                {exp.primaryMetric.significant === true
                  ? '(significant)'
                  : exp.primaryMetric.significant === false
                  ? '(not significant)'
                  : '(data maturing)'}
              </span>
            </div>
          )}
        </div>

        {/* Exposure */}
        {exp.rolloutPct !== null && (
          <div className="experiment-card__stat">
            <span className="experiment-card__stat-label">Rollout</span>
            <span className="experiment-card__stat-value">{exp.rolloutPct}%</span>
          </div>
        )}
        {exp.exposureN !== null && (
          <div className="experiment-card__stat">
            <span className="experiment-card__stat-label">Exposure</span>
            <span className="experiment-card__stat-value">{fmtCount(exp.exposureN)}</span>
          </div>
        )}

        {/* Guardrails */}
        <div className="experiment-card__stat">
          <span className="experiment-card__stat-label">Guardrails</span>
          <span
            className="experiment-card__stat-value"
            style={{ color: guardrail.color }}
            aria-label={guardrail.label}
          >
            <span aria-hidden="true">{guardrail.icon} </span>
            {guardrail.label}
          </span>
          {exp.guardrailDetails && (
            <span className="experiment-card__guardrail-detail">{exp.guardrailDetails}</span>
          )}
        </div>
      </div>

      {/* Secondary metrics — expandable */}
      {exp.secondaryMetrics.length > 0 && (
        <details
          className="experiment-card__secondary"
          onToggle={e => setExpanded((e.currentTarget as HTMLDetailsElement).open)}
        >
          <summary className="experiment-card__secondary-toggle">
            Secondary metrics ({exp.secondaryMetrics.length})
            <span aria-hidden="true">{expanded ? ' ▲' : ' ▼'}</span>
          </summary>
          <div className="experiment-card__secondary-grid">
            {exp.secondaryMetrics.map(m => (
              <div key={m.metricKey} className="experiment-card__secondary-stat">
                <span className="experiment-card__stat-label">{m.label}</span>
                {m.observedLift !== null ? (
                  <span className={`experiment-card__lift experiment-card__lift--${m.direction ?? 'flat'}`}>
                    {m.observedLift >= 0 ? '+' : ''}{fmtPct(m.observedLift)}
                    {' '}
                    <span className="experiment-card__sig">
                      {m.significant === true ? '(sig.)' : m.significant === false ? '(n.s.)' : ''}
                    </span>
                  </span>
                ) : (
                  <span className="experiment-card__stat-value" style={{ color: 'var(--text-tertiary)' }}>—</span>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Learnings — completed experiments */}
      {isCompleted && exp.learnings && (
        <div className="experiment-card__learnings">
          <span className="experiment-card__block-label">What we learned</span>
          <p className="experiment-card__learning-text">{exp.learnings}</p>
          {exp.outcome && (
            <>
              <span className="experiment-card__block-label" style={{ marginTop: 'var(--space-3)' }}>What changed</span>
              <p className="experiment-card__learning-text">{exp.outcome}</p>
            </>
          )}
        </div>
      )}

      {/* Decision ready prompt */}
      {isLive && exp.maturity === 'decision-ready' && (
        <div className="experiment-card__decision-prompt" role="alert">
          This experiment has sufficient data for a decision.
        </div>
      )}
    </article>
  )
}
