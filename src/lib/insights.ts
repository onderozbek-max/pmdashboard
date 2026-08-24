/**
 * Deterministic Insight Engine
 *
 * Generates ranked, evidence-based findings from dashboard data.
 * NO LLM dependency. All narrative is constructed from templates + data.
 *
 * Narrative rules (enforced in code):
 * 1. Every claim includes a metric/value and timeframe.
 * 2. No causal wording for observational association.
 * 3. Ordinary variation is not called meaningful.
 * 4. If evidence is insufficient, say so.
 * 5. No inflated language.
 * 6. Prefer one strong finding to five weak ones.
 * 7. Max ~3 findings on Overview.
 * 8. Hypotheses clearly identified.
 */

import type { DashboardData } from '../types/data-contract'
import { METRIC_DEFINITIONS } from '../metrics/definitions'
import { linearRegression, qualifyTrend, detectChange, extractValues } from './stats'
import { fmtPct, fmtCount, fmtCompact } from './format'

export type InsightSeverity = 'positive' | 'caution' | 'critical' | 'neutral'

export interface Insight {
  id: string
  title: string
  body: string
  /** Optional: what additional evidence to look at */
  relatedEvidence?: string
  /** Link destination — which view to navigate to */
  investigateView: 'members' | 'activities' | 'experiments' | 'overview'
  investigateLabel: string
  severity: InsightSeverity
  /** Higher score → higher priority */
  score: number
  /** Whether this is observational (association) vs causal */
  isObservational: boolean
  /** Optional hypothesis if directional data exists */
  hypothesis?: string
}

/**
 * Generate ranked insights from dashboard data.
 * Returns at most maxInsights findings.
 */
export function generateInsights(data: DashboardData, maxInsights = 3): Insight[] {
  const candidates: Insight[] = []

  candidates.push(...insightsFromP0(data))
  candidates.push(...insightsFromSupply(data))
  candidates.push(...insightsFromActivation(data))

  // Sort by score descending, take top N
  candidates.sort((a, b) => b.score - a.score)
  return candidates.slice(0, maxInsights)
}

// ─── P0 metric insights ──────────────────────────────────────────────────────

function insightsFromP0(data: DashboardData): Insight[] {
  const insights: Insight[] = []
  const { p0, manifest } = data
  const period = manifest.currentPeriodLabel

  // Monthly Active Members
  {
    const mau = p0.monthlyActiveMembers
    const def = METRIC_DEFINITIONS['monthlyActiveMembers']
    const detection = detectChange(mau.current, mau.prior, def?.noiseFloorRelative ?? 0.01)
    if (detection.isMeaningful) {
      const dir = mau.change >= 0 ? 'grew' : 'declined'
      const isPos = mau.change >= 0
      const reg = linearRegression(extractValues(mau.history))
      const trend = reg ? qualifyTrend(reg) : 'noisy'
      const trendNote = trendSentence(trend, period)

      insights.push({
        id: 'mau-change',
        title: `Monthly Active Members ${dir} ${fmtPct(Math.abs(mau.changePct))} ${period}`,
        body:
          `MAU moved from ${fmtCompact(mau.prior)} to ${fmtCompact(mau.current)} ` +
          `(${mau.change >= 0 ? '+' : ''}${fmtCount(mau.change)} members). ${trendNote}`,
        relatedEvidence: isPos
          ? undefined
          : 'Check activation funnel and activity supply coverage — both influence participation volume.',
        investigateView: 'members',
        investigateLabel: 'View member trends',
        severity: isPos ? 'positive' : (detection.magnitude === 'large' ? 'critical' : 'caution'),
        score: detection.magnitude === 'large' ? 90 : detection.magnitude === 'medium' ? 70 : 40,
        isObservational: true,
      })
    }
  }

  // Highly Engaged Members — track relative to MAU
  {
    const he = p0.highlyEngagedMembers
    const def = METRIC_DEFINITIONS['highlyEngagedMembers']
    const detection = detectChange(he.current, he.prior, def?.noiseFloorRelative ?? 0.015)
    if (detection.isMeaningful) {
      const dir = he.change >= 0 ? 'increased' : 'decreased'
      const mauCurrent = p0.monthlyActiveMembers.current
      const heSharePct = mauCurrent > 0 ? fmtPct(he.current / mauCurrent) : '—'

      insights.push({
        id: 'highly-engaged-change',
        title: `Highly Engaged Members ${dir} ${fmtPct(Math.abs(he.changePct))} ${period}`,
        body:
          `Members completing 5+ activities/month ${dir} from ` +
          `${fmtCompact(he.prior)} to ${fmtCompact(he.current)}, ` +
          `representing ${heSharePct} of MAU this period.`,
        investigateView: 'members',
        investigateLabel: 'View participation depth',
        severity: he.change >= 0 ? 'positive' : (detection.magnitude === 'large' ? 'critical' : 'caution'),
        score: detection.magnitude === 'large' ? 85 : 55,
        isObservational: true,
        hypothesis:
          he.change < 0
            ? 'Hypothesis: activity mix or supply constraints may be limiting depth of participation. Investigate activity supply coverage.'
            : undefined,
      })
    }
  }

  // Repeat Participation Rate
  {
    const rpr = p0.repeatParticipationRate
    const def = METRIC_DEFINITIONS['repeatParticipationRate']
    const detection = detectChange(rpr.current, rpr.prior, def?.noiseFloorRelative ?? 0.02)
    if (detection.isMeaningful) {
      const dir = rpr.change >= 0 ? 'improved' : 'declined'
      insights.push({
        id: 'repeat-participation-change',
        title: `Repeat Participation Rate ${dir} to ${fmtPct(rpr.current)} ${period}`,
        body:
          `The share of active members returning for a second or subsequent activity moved ` +
          `from ${fmtPct(rpr.prior)} to ${fmtPct(rpr.current)} — a ` +
          `${rpr.change >= 0 ? '+' : ''}${fmtPct(Math.abs(rpr.changePct))} change. ` +
          'This is a behavioral retention signal, not overall completion rate.',
        relatedEvidence: rpr.change < 0
          ? 'Consider whether activity variety or relevance is driving re-engagement. This is associative, not causal.'
          : undefined,
        investigateView: 'activities',
        investigateLabel: 'Review activity performance',
        severity: rpr.change >= 0 ? 'positive' : (detection.magnitude === 'large' ? 'critical' : 'caution'),
        score: detection.magnitude === 'large' ? 88 : 60,
        isObservational: true,
      })
    }
  }

  // Activation Rate
  {
    const ar = p0.newMemberActivationRate
    const def = METRIC_DEFINITIONS['newMemberActivationRate']
    const detection = detectChange(ar.current, ar.prior, def?.noiseFloorRelative ?? 0.02)
    if (detection.isMeaningful) {
      const dir = ar.change >= 0 ? 'improved' : 'declined'
      insights.push({
        id: 'activation-rate-change',
        title: `New Member Activation Rate ${dir} to ${fmtPct(ar.current)} ${period}`,
        body:
          `Share of new members completing their first activity within 14 days of joining ` +
          `moved from ${fmtPct(ar.prior)} to ${fmtPct(ar.current)}.`,
        relatedEvidence: ar.change < 0
          ? 'Review join flow completion and onboarding steps — drop-offs at either stage would reduce activation.'
          : undefined,
        investigateView: 'members',
        investigateLabel: 'View activation funnel',
        severity: ar.change >= 0 ? 'positive' : (detection.magnitude === 'large' ? 'critical' : 'caution'),
        score: detection.magnitude === 'large' ? 82 : 58,
        isObservational: true,
      })
    }
  }

  return insights
}

// ─── Supply insights ─────────────────────────────────────────────────────────

function insightsFromSupply(data: DashboardData): Insight[] {
  const insights: Insight[] = []
  const { supply, p0, manifest } = data
  const period = manifest.currentPeriodLabel

  // If supply coverage is below 80%, flag it
  const coverage = p0.activitySupplyCoverage.current
  if (coverage < 0.80 && supply?.membersWithZeroAvailablePct !== undefined) {
    const severity: InsightSeverity = coverage < 0.65 ? 'critical' : 'caution'
    insights.push({
      id: 'supply-coverage-low',
      title: `Activity Supply Coverage at ${fmtPct(coverage)} — ${fmtPct(supply.membersWithZeroAvailablePct)} of members have no eligible activities`,
      body:
        `${fmtCount(supply.membersWithZeroAvailable)} active members currently have zero eligible activities. ` +
        `This represents a supply-side constraint that limits participation opportunity. ` +
        `Low coverage may explain flat or declining participation without indicating low demand.`,
      investigateView: 'activities',
      investigateLabel: 'View activity supply',
      severity,
      score: severity === 'critical' ? 95 : 75,
      isObservational: true,
      hypothesis:
        'Hypothesis: expanding available activity types or increasing pool size would raise participation rates if demand exists. ' +
        'Check activity supply coverage trend for confirmation.',
    })
  }

  // If supply coverage declined meaningfully
  const supplyChange = detectChange(
    p0.activitySupplyCoverage.current,
    p0.activitySupplyCoverage.prior,
    0.03
  )
  if (supplyChange.isMeaningful && p0.activitySupplyCoverage.change < 0) {
    insights.push({
      id: 'supply-coverage-declined',
      title: `Activity Supply Coverage declined ${fmtPct(Math.abs(supplyChange.changePct))} ${period}`,
      body:
        `Supply Coverage moved from ${fmtPct(p0.activitySupplyCoverage.prior)} to ` +
        `${fmtPct(p0.activitySupplyCoverage.current)}. ` +
        `Fewer members had at least one eligible activity available. ` +
        `This is observational — it may explain participation-volume changes without indicating reduced demand.`,
      investigateView: 'activities',
      investigateLabel: 'Investigate supply',
      severity: 'caution',
      score: 72,
      isObservational: true,
    })
  }

  return insights
}

// ─── Activation insights ──────────────────────────────────────────────────────

function insightsFromActivation(data: DashboardData): Insight[] {
  const insights: Insight[] = []
  const { activation } = data

  // If join flow completion < 70%
  if (activation.joinFlowCompletionRate < 0.70) {
    insights.push({
      id: 'join-flow-drop',
      title: `Join Flow Completion at ${fmtPct(activation.joinFlowCompletionRate)} — top-of-funnel drop-off`,
      body:
        `${fmtPct(1 - activation.joinFlowCompletionRate)} of members who started the join flow did not complete it. ` +
        `This is an upstream constraint on Community growth.`,
      investigateView: 'members',
      investigateLabel: 'View activation funnel',
      severity: activation.joinFlowCompletionRate < 0.55 ? 'critical' : 'caution',
      score: activation.joinFlowCompletionRate < 0.55 ? 80 : 55,
      isObservational: true,
    })
  }

  return insights
}

// ─── Narrative helpers ────────────────────────────────────────────────────────

function trendSentence(trend: string, _period?: string): string {
  switch (trend) {
    case 'strong-up':    return `The multi-period trend is strongly upward.`
    case 'up':           return `The multi-period trend is upward.`
    case 'flat':         return `The multi-period trend is flat — this change may not reflect a sustained shift.`
    case 'down':         return `The multi-period trend is downward.`
    case 'strong-down':  return `The multi-period trend is strongly downward.`
    case 'noisy':        return `The series is noisy — single-period change should be interpreted cautiously.`
    default:             return ''
  }
}

/**
 * Generate a "No meaningful change detected" neutral finding
 * when no candidates pass thresholds.
 */
export function noChangeInsight(): Insight {
  return {
    id: 'no-change',
    title: 'No meaningful change detected this period',
    body:
      'All P0 metrics are within normal variation bounds. ' +
      'No changes are large enough to warrant narrative attention.',
    investigateView: 'overview',
    investigateLabel: 'View all metrics',
    severity: 'neutral',
    score: 0,
    isObservational: true,
  }
}

/**
 * Determine "Needs Attention" items from P0 metrics.
 * Returns metrics that are watch or critical.
 */
export interface AttentionItem {
  metricKey: string
  label: string
  status: 'healthy' | 'watch' | 'critical'
  statusLabel: string
  note: string
  view: 'members' | 'activities' | 'experiments'
}

export function getAttentionItems(data: DashboardData): AttentionItem[] {
  const items: AttentionItem[] = []
  const { p0 } = data

  const checks: Array<{
    key: string
    current: number
    prior: number
    view: 'members' | 'activities' | 'experiments'
    notePositive: string
    noteNegative: string
  }> = [
    {
      key: 'monthlyActiveMembers',
      current: p0.monthlyActiveMembers.current,
      prior: p0.monthlyActiveMembers.prior,
      view: 'members',
      notePositive: 'Growing steadily',
      noteNegative: 'Month-over-month decline — review participation trends',
    },
    {
      key: 'newMemberActivationRate',
      current: p0.newMemberActivationRate.current,
      prior: p0.newMemberActivationRate.prior,
      view: 'members',
      notePositive: 'Activation healthy',
      noteNegative: 'Activation declining — check join funnel',
    },
    {
      key: 'repeatParticipationRate',
      current: p0.repeatParticipationRate.current,
      prior: p0.repeatParticipationRate.prior,
      view: 'members',
      notePositive: 'Repeat participation stable',
      noteNegative: 'Repeat engagement declining',
    },
    {
      key: 'activitySupplyCoverage',
      current: p0.activitySupplyCoverage.current,
      prior: p0.activitySupplyCoverage.prior,
      view: 'activities',
      notePositive: 'Supply coverage adequate',
      noteNegative: 'Supply gap limiting participation opportunity',
    },
  ]

  for (const check of checks) {
    const def = METRIC_DEFINITIONS[check.key]
    if (!def) continue

    const change = check.prior > 0
      ? (check.current - check.prior) / check.prior
      : 0
    const isImproving = def.positiveDirection === 'up' ? change >= 0 : change <= 0
    const magnitude = Math.abs(change)

    let status: 'healthy' | 'watch' | 'critical' = 'healthy'
    if (!isImproving && magnitude > 0.1) status = 'critical'
    else if (!isImproving && magnitude > 0.04) status = 'watch'

    // Also check absolute low values for rates
    if (def.unit === 'pct' || def.unit === 'rate') {
      if (check.current < 0.40) status = 'critical'
      else if (check.current < 0.55) status = status === 'critical' ? 'critical' : 'watch'
    }

    if (status !== 'healthy') {
      items.push({
        metricKey: check.key,
        label: def.label,
        status,
        statusLabel: status === 'critical' ? 'Needs Attention' : 'Watch',
        note: check.noteNegative,
        view: check.view,
      })
    }
  }

  return items
}
