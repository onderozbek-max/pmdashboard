import type { Insight } from '../../lib/insights'
import { useNavigate } from '../../lib/router'
import type { Route } from '../../lib/router'
import './InsightCard.css'

const SEVERITY_META = {
  positive: { icon: '↑', label: 'Positive', className: 'insight-card--positive' },
  caution:  { icon: '△', label: 'Caution',  className: 'insight-card--caution' },
  critical: { icon: '▼', label: 'Critical', className: 'insight-card--critical' },
  neutral:  { icon: '—', label: 'Neutral',  className: 'insight-card--neutral' },
}

interface Props { insight: Insight }

export default function InsightCard({ insight }: Props) {
  const navigate = useNavigate()
  const meta = SEVERITY_META[insight.severity]

  const handleNavigate = () => {
    if (insight.investigateView !== 'overview') {
      navigate(`/${insight.investigateView}` as Route)
    }
  }

  return (
    <article
      className={`insight-card ${meta.className}`}
      aria-labelledby={`insight-${insight.id}-title`}
    >
      <div className="insight-card__header">
        <span
          className={`insight-card__icon`}
          role="img"
          aria-label={meta.label}
        >
          {meta.icon}
        </span>
        <h3 id={`insight-${insight.id}-title`} className="insight-card__title">
          {insight.title}
        </h3>
      </div>

      <p className="insight-card__body">{insight.body}</p>

      {insight.relatedEvidence && (
        <p className="insight-card__evidence">
          <span className="insight-card__evidence-label">Related: </span>
          {insight.relatedEvidence}
        </p>
      )}

      {insight.hypothesis && (
        <p className="insight-card__hypothesis">
          <span className="insight-card__hypothesis-label">Hypothesis: </span>
          {insight.hypothesis.replace(/^Hypothesis: /, '')}
        </p>
      )}

      {insight.isObservational && insight.severity !== 'neutral' && (
        <p className="insight-card__obs-note">
          Observational data — association, not causation.
        </p>
      )}

      {insight.investigateView !== 'overview' && (
        <button
          className="insight-card__action"
          onClick={handleNavigate}
          aria-label={`${insight.investigateLabel} — ${insight.title}`}
        >
          {insight.investigateLabel} →
        </button>
      )}
    </article>
  )
}
