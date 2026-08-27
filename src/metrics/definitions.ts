/**
 * MMC Community Dashboard — Metric Definitions Registry
 *
 * SINGLE SOURCE OF TRUTH for all business metric definitions.
 * Components must NOT embed business definitions.
 * The batch process and validator may import from this file.
 *
 * Never scatter qualifying windows, thresholds, or business
 * definitions through UI components.
 */

// ─── Thresholds ─────────────────────────────────────────────────────────────

/** Minimum activities per month for a member to be classified as Highly Engaged */
export const HIGHLY_ENGAGED_THRESHOLD = 5

/** Lookback window in days for Repeat Participation qualification */
export const REPEAT_PARTICIPATION_WINDOW_DAYS = 30

/** Minimum prior participation events for Repeat Participation to qualify */
export const REPEAT_PARTICIPATION_MIN_EVENTS = 2

/** New Member Activation window in days from join date */
export const NEW_MEMBER_ACTIVATION_WINDOW_DAYS = 14

/** New Member Activation qualifying event: minimum activities to be considered activated */
export const NEW_MEMBER_ACTIVATION_MIN_ACTIVITIES = 1

/**
 * Activity Supply Coverage definition:
 * Percentage of MAU members who have at least one eligible activity
 * available during the current rolling 7-day window.
 */
export const ACTIVITY_SUPPLY_COVERAGE_WINDOW_DAYS = 7
export const ACTIVITY_SUPPLY_COVERAGE_MIN_ELIGIBLE = 1

// ─── P0 Metric definitions ──────────────────────────────────────────────────

export interface MetricDefinition {
  key: string
  label: string
  shortLabel?: string
  description: string
  /** Human-readable definition of the qualifying event/window */
  qualifyingDefinition?: string
  unit: 'count' | 'rate' | 'pct' | 'days' | 'number'
  /** Which group this metric belongs to for visual grouping */
  group: 'community-scale' | 'participation-engine' | 'acquisition' | 'engagement' | 'supply' | 'experiments' | 'rewards'
  /** P0 = homepage card, P1 = diagnostic view */
  priority: 'P0' | 'P1'
  /** Denominator context for rates */
  denominator?: string
  /** Narrative notes for the insight engine */
  positiveDirection: 'up' | 'down'
  /** Magnitude below which change is not noteworthy (absolute) */
  noiseFloorAbsolute?: number
  /** Magnitude below which change is not noteworthy (relative) */
  noiseFloorRelative?: number
}

export const METRIC_DEFINITIONS: Record<string, MetricDefinition> = {
  // ── Community Scale ──────────────────────────────────────────────────────

  totalMembers: {
    key: 'totalMembers',
    label: 'Total Members',
    shortLabel: 'Members',
    description: 'Overall size of the Member\'s Mark Community.',
    unit: 'count',
    group: 'community-scale',
    priority: 'P0',
    positiveDirection: 'up',
    noiseFloorRelative: 0.005,
  },

  monthlyActiveMembers: {
    key: 'monthlyActiveMembers',
    label: 'Monthly Active Members',
    shortLabel: 'MAU',
    description: 'Members who completed at least one Community activity in the rolling 30-day window.',
    qualifyingDefinition:
      'A member is Monthly Active if they completed ≥1 participation activity in the rolling 30-day window ending on the report date.',
    unit: 'count',
    group: 'community-scale',
    priority: 'P0',
    denominator: 'Total Members',
    positiveDirection: 'up',
    noiseFloorRelative: 0.01,
  },

  highlyEngagedMembers: {
    key: 'highlyEngagedMembers',
    label: 'Highly Engaged Members',
    shortLabel: 'Highly Engaged',
    description: `Members completing ${HIGHLY_ENGAGED_THRESHOLD}+ activities per month — measuring depth of Community participation.`,
    qualifyingDefinition:
      `A member is Highly Engaged if they completed ≥${HIGHLY_ENGAGED_THRESHOLD} participation activities in the last complete calendar month. ` +
      `Uses the same population window as Monthly Active Members for denominatoral consistency.`,
    unit: 'count',
    group: 'community-scale',
    priority: 'P0',
    denominator: 'Monthly Active Members',
    positiveDirection: 'up',
    noiseFloorRelative: 0.015,
  },

  // ── Participation Engine ─────────────────────────────────────────────────

  newMemberActivationRate: {
    key: 'newMemberActivationRate',
    label: 'New Member Activation Rate',
    shortLabel: 'Activation Rate',
    description: 'Share of new members who completed at least one Community activity within the activation window.',
    qualifyingDefinition:
      `Activation Rate = members who completed ≥${NEW_MEMBER_ACTIVATION_MIN_ACTIVITIES} activity within ` +
      `${NEW_MEMBER_ACTIVATION_WINDOW_DAYS} days of joining ÷ total new members in the cohort.`,
    unit: 'pct',
    group: 'participation-engine',
    priority: 'P0',
    denominator: 'New members in cohort',
    positiveDirection: 'up',
    noiseFloorRelative: 0.02,
  },

  repeatParticipationRate: {
    key: 'repeatParticipationRate',
    label: 'Repeat Participation Rate',
    shortLabel: 'Repeat Rate',
    description: 'Share of active members who returned for a second or subsequent participation event within the qualifying window.',
    qualifyingDefinition:
      `Repeat Participation Rate = members with ≥${REPEAT_PARTICIPATION_MIN_EVENTS} participation events in the ` +
      `rolling ${REPEAT_PARTICIPATION_WINDOW_DAYS}-day window ÷ Monthly Active Members. ` +
      'This is a behavioral retention signal, not a generic completion rate.',
    unit: 'pct',
    group: 'participation-engine',
    priority: 'P0',
    denominator: 'Monthly Active Members',
    positiveDirection: 'up',
    noiseFloorRelative: 0.02,
  },

  activitySupplyCoverage: {
    key: 'activitySupplyCoverage',
    label: 'Activity Supply Coverage',
    shortLabel: 'Supply Coverage',
    description: 'Percentage of active members with at least one eligible participation opportunity available.',
    qualifyingDefinition:
      `Activity Supply Coverage = MAU members with ≥${ACTIVITY_SUPPLY_COVERAGE_MIN_ELIGIBLE} eligible activity ` +
      `in the rolling ${ACTIVITY_SUPPLY_COVERAGE_WINDOW_DAYS}-day window ÷ Monthly Active Members. ` +
      'Distinguishes participation-demand problems from participation-supply problems.',
    unit: 'pct',
    group: 'participation-engine',
    priority: 'P0',
    denominator: 'Monthly Active Members',
    positiveDirection: 'up',
    noiseFloorRelative: 0.015,
  },

  // ── P1 Acquisition ───────────────────────────────────────────────────────

  newMembers: {
    key: 'newMembers',
    label: 'New Members',
    description: 'Members who joined the Community during the current period.',
    unit: 'count',
    group: 'acquisition',
    priority: 'P1',
    positiveDirection: 'up',
  },

  joinFlowCompletionRate: {
    key: 'joinFlowCompletionRate',
    label: 'Join Flow Completion',
    description: 'Share of members who started the join flow and completed it.',
    unit: 'pct',
    group: 'acquisition',
    priority: 'P1',
    positiveDirection: 'up',
  },

  onboardingCompletionRate: {
    key: 'onboardingCompletionRate',
    label: 'Participatory Onboarding Completion',
    description: 'Share of new members completing the participatory onboarding experience.',
    unit: 'pct',
    group: 'acquisition',
    priority: 'P1',
    positiveDirection: 'up',
  },

  timeToFirstParticipation: {
    key: 'timeToFirstParticipation',
    label: 'Time to First Participation',
    description: 'Median days from join to completing the first Community activity.',
    unit: 'days',
    group: 'acquisition',
    priority: 'P1',
    positiveDirection: 'down',
  },

  // ── P1 Engagement ────────────────────────────────────────────────────────

  activitiesPerActiveMember: {
    key: 'activitiesPerActiveMember',
    label: 'Activities per Active Member',
    description: 'Average number of activities completed by Monthly Active Members in the period.',
    unit: 'number',
    group: 'engagement',
    priority: 'P1',
    positiveDirection: 'up',
  },

  w2Retention: {
    key: 'w2Retention',
    label: 'W2 Participation Retention',
    description: 'Share of members who participated again in week 2 after their first activity.',
    unit: 'pct',
    group: 'engagement',
    priority: 'P1',
    positiveDirection: 'up',
  },

  w4Retention: {
    key: 'w4Retention',
    label: 'W4 Participation Retention',
    description: 'Share of members who participated again at week 4 after their first activity.',
    unit: 'pct',
    group: 'engagement',
    priority: 'P1',
    positiveDirection: 'up',
  },

  // ── P1 Supply ────────────────────────────────────────────────────────────

  eligibleActivitiesPerMember: {
    key: 'eligibleActivitiesPerMember',
    label: 'Eligible Activities per Member',
    description: 'Average number of activities a member is eligible to complete in the current week.',
    unit: 'number',
    group: 'supply',
    priority: 'P1',
    positiveDirection: 'up',
  },

  membersWithZeroAvailable: {
    key: 'membersWithZeroAvailable',
    label: 'Members with Zero Available Activities',
    description: 'Count (and share) of MAU members who have no eligible activities available.',
    unit: 'count',
    group: 'supply',
    priority: 'P1',
    positiveDirection: 'down',
  },

  // ── Rewards (architecture stub — no page in V1) ──────────────────────────

  tierDistribution: {
    key: 'tierDistribution',
    label: 'Tier Distribution',
    description: 'Distribution of members across reward tiers.',
    unit: 'count',
    group: 'rewards',
    priority: 'P1',
    positiveDirection: 'up',
  },
}

// ─── Convenience lookups ─────────────────────────────────────────────────────

export const P0_METRICS = Object.values(METRIC_DEFINITIONS)
  .filter(m => m.priority === 'P0')

export const COMMUNITY_SCALE_METRICS = Object.values(METRIC_DEFINITIONS)
  .filter(m => m.group === 'community-scale' && m.priority === 'P0')

export const PARTICIPATION_ENGINE_METRICS = Object.values(METRIC_DEFINITIONS)
  .filter(m => m.group === 'participation-engine' && m.priority === 'P0')

export function getMetric(key: string): MetricDefinition | undefined {
  return METRIC_DEFINITIONS[key]
}

// ─── Status thresholds ───────────────────────────────────────────────────────

/**
 * Determine health status for a metric given its current and prior values.
 * Returns 'healthy' | 'watch' | 'critical'.
 * Thresholds are intentionally conservative — only clear deviations trigger alerts.
 */
export function getMetricHealthStatus(
  key: string,
  current: number,
  prior: number
): 'healthy' | 'watch' | 'critical' {
  const def = METRIC_DEFINITIONS[key]
  if (!def) return 'healthy'

  const change = prior > 0 ? (current - prior) / prior : 0
  const isImproving = def.positiveDirection === 'up' ? change >= 0 : change <= 0
  const magnitude = Math.abs(change)

  if (isImproving) return 'healthy'
  if (magnitude > 0.1) return 'critical'
  if (magnitude > 0.04) return 'watch'
  return 'healthy'
}
