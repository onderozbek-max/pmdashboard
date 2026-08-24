import { useData } from '../../App'
import { unwrap } from '../../data/loader'
import { METRIC_DEFINITIONS } from '../../metrics/definitions'
import { generateInsights, noChangeInsight, getAttentionItems } from '../../lib/insights'
import type { DashboardData } from '../../types/data-contract'
import { useNavigate } from '../../lib/router'
import MetricCard from '../../components/ui/MetricCard'
import SectionError from '../../components/ui/SectionError'
import { MetricCardSkeleton } from '../../components/ui/LoadingSkeleton'
import LineChart from '../../components/charts/LineChart'
import PageHeader from './PageHeader'
import InsightCard from './InsightCard'
import AttentionModule from './AttentionModule'
import ExperimentRadar from './ExperimentRadar'
import './OverviewPage.css'

export default function OverviewPage() {
  const { bundle, loading } = useData()

  const manifest  = bundle ? unwrap(bundle.manifest) : null
  const p0        = bundle ? unwrap(bundle.p0) : null
  const lifecycle = bundle ? unwrap(bundle.lifecycle) : null
  const exps      = bundle ? unwrap(bundle.experiments) : null

  // Build full data object for insight engine
  // Build a full data object for the insight engine.
  // Sections that failed to load use an empty stub so the engine
  // can degrade gracefully rather than crashing.
  const stub = <T,>() => ({} as unknown as T)
  const fullData: DashboardData | null =
    p0 && manifest && lifecycle && bundle
      ? {
          manifest,
          p0,
          lifecycle,
          activation: unwrap(bundle.activation) ?? stub<DashboardData['activation']>(),
          retention:  unwrap(bundle.retention)  ?? stub<DashboardData['retention']>(),
          depth:      unwrap(bundle.depth)      ?? stub<DashboardData['depth']>(),
          supply:     unwrap(bundle.supply)     ?? stub<DashboardData['supply']>(),
          mix:        unwrap(bundle.mix)        ?? stub<DashboardData['mix']>(),
          performance: unwrap(bundle.performance) ?? stub<DashboardData['performance']>(),
          experiments: exps ?? { experiments: [] },
        }
      : null

  const insights = fullData ? generateInsights(fullData) : []
  const finalInsights = insights.length > 0 ? insights : [noChangeInsight()]
  const attentionItems = fullData ? getAttentionItems(fullData) : []

  // Targets from manifest
  const targets = manifest?.targets ?? {}

  return (
    <div className="overview-page">
      <PageHeader />

      {/* ── A. Product Health — P0 Metrics ────────────────────────────────── */}
      <section className="overview-section" aria-labelledby="health-heading">
        <h2 id="health-heading" className="section-heading">Product Health</h2>

        {!bundle?.p0.ok && !loading && (
          <SectionError section="Product Health" />
        )}

        {/* Community Scale group */}
        <div className="p0-group" aria-labelledby="community-scale-heading">
          <div className="p0-group__header">
            <h3 id="community-scale-heading" className="p0-group__label">Community Scale</h3>
            <p className="p0-group__description">Total reach → active → deeply engaged</p>
          </div>

          <div className="p0-scale-grid">
            {loading ? (
              <>
                <MetricCardSkeleton/>
                <MetricCardSkeleton/>
                <MetricCardSkeleton/>
              </>
            ) : p0 ? (
              <>
                <MetricCard
                  definition={METRIC_DEFINITIONS['totalMembers']!}
                  snapshot={p0.totalMembers}
                  target={targets['totalMembers']}
                />
                <div className="p0-scale-arrow" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--border-default)" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M5 10h10M12 7l3 3-3 3"/>
                  </svg>
                </div>
                <MetricCard
                  definition={METRIC_DEFINITIONS['monthlyActiveMembers']!}
                  snapshot={p0.monthlyActiveMembers}
                  target={targets['monthlyActiveMembers']}
                  denominatorValue={p0.totalMembers.current}
                  variant="subordinate"
                />
                <div className="p0-scale-arrow" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--border-default)" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M5 10h10M12 7l3 3-3 3"/>
                  </svg>
                </div>
                <MetricCard
                  definition={METRIC_DEFINITIONS['highlyEngagedMembers']!}
                  snapshot={p0.highlyEngagedMembers}
                  target={targets['highlyEngagedMembers']}
                  denominatorValue={p0.monthlyActiveMembers.current}
                  variant="subordinate"
                />
              </>
            ) : null}
          </div>
        </div>

        {/* Participation Engine group */}
        <div className="p0-group" aria-labelledby="participation-engine-heading">
          <div className="p0-group__header">
            <h3 id="participation-engine-heading" className="p0-group__label">Participation Engine</h3>
            <p className="p0-group__description">How well does activation, re-engagement, and supply function?</p>
          </div>

          <div className="p0-engine-grid">
            {loading ? (
              <>
                <MetricCardSkeleton/>
                <MetricCardSkeleton/>
                <MetricCardSkeleton/>
              </>
            ) : p0 ? (
              <>
                <MetricCard
                  definition={METRIC_DEFINITIONS['newMemberActivationRate']!}
                  snapshot={p0.newMemberActivationRate}
                  target={targets['newMemberActivationRate']}
                  contextLabel="New members → first activity"
                />
                <MetricCard
                  definition={METRIC_DEFINITIONS['repeatParticipationRate']!}
                  snapshot={p0.repeatParticipationRate}
                  contextLabel="Active members returning for more"
                />
                <MetricCard
                  definition={METRIC_DEFINITIONS['activitySupplyCoverage']!}
                  snapshot={p0.activitySupplyCoverage}
                  contextLabel="Members with ≥1 eligible activity"
                />
              </>
            ) : null}
          </div>
        </div>
      </section>

      {/* ── B. What's Changed + Needs Attention side-by-side ───────────────── */}
      <div className="overview-two-col">

        {/* What's Changed */}
        <section className="overview-section overview-section--flush" aria-labelledby="whats-changed-heading">
          <h2 id="whats-changed-heading" className="section-heading">What's Changed</h2>
          <div className="insights-list">
            {loading
              ? Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} style={{ height: 100, borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                    <div className="skeleton" style={{ height: '100%' }}/>
                  </div>
                ))
              : finalInsights.map(insight => (
                  <InsightCard key={insight.id} insight={insight} />
                ))
            }
          </div>
        </section>

        {/* Needs Attention */}
        <section className="overview-section overview-section--flush" aria-labelledby="needs-attention-heading">
          <h2 id="needs-attention-heading" className="section-heading">Needs Attention</h2>
          <AttentionModule items={attentionItems} loading={loading} />
        </section>

      </div>

      {/* ── C. Community Growth chart ──────────────────────────────────────── */}
      <section className="overview-section" aria-labelledby="growth-heading">
        <div className="section-heading-row">
          <h2 id="growth-heading" className="section-heading">Community Growth</h2>
          <p className="section-sub">Monthly Active Members over time</p>
        </div>

        {!bundle?.lifecycle.ok && !loading ? (
          <SectionError section="Community Growth" />
        ) : lifecycle && (
          <div className="surface surface--elevated" style={{ padding: 'var(--space-5)' }}>
            <LineChart
              title="Community Growth"
              series={[
                {
                  key: 'mau',
                  label: 'Monthly Active Members',
                  data: lifecycle.mauHistory,
                  color: 'var(--chart-1)',
                },
                ...(p0
                  ? [{
                      key: 'he',
                      label: 'Highly Engaged',
                      data: p0.highlyEngagedMembers.history,
                      color: 'var(--chart-2)',
                      dashed: true,
                    }]
                  : []),
              ]}
              target={targets['monthlyActiveMembers']}
              annotations={manifest?.annotations ?? []}
              height={240}
            />
          </div>
        )}
      </section>

      {/* ── D. Experiment Radar ────────────────────────────────────────────── */}
      <section className="overview-section" aria-labelledby="experiments-heading">
        <div className="section-heading-row">
          <h2 id="experiments-heading" className="section-heading">Experiment Radar</h2>
          <a href="#/experiments" className="section-link" aria-label="View all experiments">
            View all →
          </a>
        </div>

        {!bundle?.experiments.ok && !loading ? (
          <SectionError section="Experiment Radar" />
        ) : (
          <ExperimentRadar
            experiments={exps?.experiments.filter(e => e.status === 'live') ?? []}
            loading={loading}
          />
        )}
      </section>
    </div>
  )
}
