import type { ReactNode } from 'react'
import { fmtMetricValue, fmtChangePct } from '../../lib/format'
import type { MetricDefinition } from '../../metrics/definitions'
import type { KpiSnapshot, Target } from '../../types/data-contract'
import Sparkline from './Sparkline'
import ProgressBar from './ProgressBar'
import './MetricCard.css'

interface MetricCardProps {
  definition: MetricDefinition
  snapshot: KpiSnapshot
  target?: Target
  /** Contextual denominator value for showing percentage-of context */
  denominatorValue?: number
  /** Optional supplementary label below the value */
  contextLabel?: string
  /** Whether this is a child/subordinate metric (smaller visual weight) */
  variant?: 'primary' | 'subordinate'
  /** Navigate to detail when clicked */
  onNavigate?: () => void
}

const DIRECTION_ICONS: Record<string, ReactNode> = {
  up: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      <path d="M6 2l4 5H2l4-5z"/>
    </svg>
  ),
  down: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      <path d="M6 10L2 5h8l-4 5z"/>
    </svg>
  ),
  flat: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      <rect x="2" y="5.5" width="8" height="1" rx="0.5"/>
    </svg>
  ),
}

function getDeltaClass(direction: 'up' | 'down' | 'flat', positiveDirection: 'up' | 'down'): string {
  if (direction === 'flat') return 'delta--neutral'
  const isPositive = direction === positiveDirection
  return isPositive ? 'delta--positive' : 'delta--negative'
}

export default function MetricCard({
  definition,
  snapshot,
  target,
  denominatorValue,
  contextLabel,
  variant = 'primary',
  onNavigate,
}: MetricCardProps) {
  const valueStr = fmtMetricValue(snapshot.current, definition.unit)
  const changeStr = fmtChangePct(snapshot.changePct)
  const deltaClass = getDeltaClass(snapshot.direction, definition.positiveDirection)

  const sparkData = snapshot.history.map(h => h.value)
  const targetValue = target?.value

  // Show % of denominator if available and relevant
  const denominatorStr =
    denominatorValue && denominatorValue > 0
      ? `${((snapshot.current / denominatorValue) * 100).toFixed(1)}% of ${definition.denominator}`
      : null

  const progressPct = targetValue && targetValue > 0
    ? Math.min(1, snapshot.current / targetValue)
    : null

  const sparkColor = snapshot.direction === definition.positiveDirection
    ? 'var(--chart-1)'
    : snapshot.direction === 'flat'
    ? 'var(--chart-muted)'
    : 'var(--color-critical)'

  const label = `${definition.label}: ${valueStr}, ${changeStr} ${snapshot.direction}. ${
    contextLabel ?? ''
  }`

  return (
    <article
      className={`metric-card metric-card--${variant}`}
      aria-label={label}
      onClick={onNavigate}
      onKeyDown={e => e.key === 'Enter' && onNavigate?.()}
      tabIndex={onNavigate ? 0 : undefined}
      role={onNavigate ? 'button' : undefined}
    >
      <header className="metric-card__header">
        <span className="metric-card__label">{definition.label}</span>
        {sparkData.length >= 2 && (
          <Sparkline
            data={sparkData}
            width={variant === 'subordinate' ? 56 : 72}
            height={variant === 'subordinate' ? 22 : 28}
            color={sparkColor}
            target={targetValue}
          />
        )}
      </header>

      <div className="metric-card__value tabular" aria-hidden="true">
        {valueStr}
      </div>

      <footer className="metric-card__footer">
        <span
          className={`delta ${deltaClass}`}
          aria-label={`${changeStr} ${snapshot.direction === definition.positiveDirection ? 'positive' : snapshot.direction === 'flat' ? 'neutral' : 'negative'}`}
        >
          <span className="delta__icon" aria-hidden="true">
            {DIRECTION_ICONS[snapshot.direction]}
          </span>
          {changeStr}
          <span className="sr-only"> {snapshot.direction}</span>
        </span>

        {denominatorStr && (
          <span className="metric-card__denom">{denominatorStr}</span>
        )}

        {contextLabel && !denominatorStr && (
          <span className="metric-card__context">{contextLabel}</span>
        )}
      </footer>

      {progressPct !== null && target && (
        <div className="metric-card__progress">
          <ProgressBar
            value={progressPct}
            label={`Progress toward target of ${fmtMetricValue(target.value, definition.unit)}`}
          />
          <span className="metric-card__target-label" aria-hidden="true">
            Target: {fmtMetricValue(target.value, definition.unit)} by {target.byDate}
          </span>
        </div>
      )}
    </article>
  )
}
