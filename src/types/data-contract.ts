/**
 * MMC Community Dashboard — Static Data Contract
 * Schema Version: 1.0
 *
 * All dashboard data files must conform to these types.
 * The batch process is responsible for generating conforming JSON.
 * The validator (scripts/validate-data.ts) enforces these shapes at CI time.
 *
 * Browser reads these from /data/ via fetch(). No direct data-source access.
 */

// ─── Core primitives ───────────────────────────────────────────────────────

/** ISO-8601 date string, e.g. "2024-03" (monthly) or "2024-03-15" (daily) */
export type DateString = string

/** Value in [0, 1] representing a rate or proportion */
export type Rate = number

/** Positive integer count */
export type Count = number

export type DataSource = 'synthetic' | 'live'

export type SchemaVersion = '1.0'

// ─── Time-series point ──────────────────────────────────────────────────────

export interface TimePoint {
  date: DateString
  value: number
}

// ─── Target ────────────────────────────────────────────────────────────────

export interface Target {
  value: number
  /** ISO-8601 date by which the target should be reached */
  byDate: DateString
  /** Optional trajectory — expected value at each date */
  trajectory?: TimePoint[]
}

// ─── Manifest ──────────────────────────────────────────────────────────────

export interface Manifest {
  schemaVersion: SchemaVersion
  /** Drives the synthetic-data banner. "synthetic" → banner shown. */
  source: DataSource
  /** ISO-8601 datetime of the most recent data batch */
  dataThrough: DateString
  /** ISO-8601 datetime this manifest was generated */
  generatedAt: DateString
  /** Maximum acceptable data age in hours before showing stale warning */
  freshnessThresholdHours: number
  /** Period label shown in UI */
  currentPeriodLabel: string
  /** Period label for comparison */
  priorPeriodLabel: string
  /** Configured targets indexed by metric key */
  targets: Partial<Record<string, Target>>
  /** Event annotations (launches, milestones) */
  annotations: EventAnnotation[]
}

export interface EventAnnotation {
  id: string
  date: DateString
  label: string
  category: 'launch' | 'experiment' | 'milestone' | 'incident'
  description?: string
}

// ─── P0 KPI Dataset ────────────────────────────────────────────────────────

export interface KpiSnapshot {
  current: number
  prior: number
  /** Absolute change: current − prior */
  change: number
  /** Relative change: (current − prior) / prior */
  changePct: number
  /** direction drives icon/color — must also have text label */
  direction: 'up' | 'down' | 'flat'
  history: TimePoint[]
}

export interface P0Dataset {
  totalMembers:          KpiSnapshot
  monthlyActiveMembers:  KpiSnapshot
  highlyEngagedMembers:  KpiSnapshot
  newMemberActivationRate:   KpiSnapshot
  repeatParticipationRate:   KpiSnapshot
  activitySupplyCoverage:    KpiSnapshot
}

// ─── Member Lifecycle ───────────────────────────────────────────────────────

export interface LifecycleStage {
  stage: string
  count: Count
}

export interface MemberLifecycleDataset {
  /** Ordered journey stages: Joined → Activated → Participated → Repeated → Highly Engaged */
  stages: LifecycleStage[]
  /** MAU trend (Monthly Active Members over time) */
  mauHistory: TimePoint[]
}

// ─── Activation Funnel ─────────────────────────────────────────────────────

export interface FunnelStep {
  step: string
  count: Count
  /** Conversion from the *first* step */
  conversionFromTop: Rate
  /** Conversion from the immediately preceding step */
  conversionFromPrior: Rate
  medianDaysFromJoin?: number
}

export interface ActivationDataset {
  cohortLabel: string
  steps: FunnelStep[]
  /** P1 activation metrics */
  newMembersThisPeriod: Count
  joinFlowCompletionRate: Rate
  onboardingCompletionRate: Rate
  /** Median days from join to first participation */
  medianDaysToFirstParticipation: number
  firstResearchActivityCompletionRate: Rate
}

// ─── Cohort Retention ──────────────────────────────────────────────────────

export interface CohortRow {
  cohortLabel: string
  startDate: DateString
  startSize: Count
  /** Retention at each week interval */
  w1: Rate | null
  w2: Rate | null
  w4: Rate | null
  w8: Rate | null
  w12: Rate | null
}

export interface RetentionDataset {
  cohorts: CohortRow[]
  /** Summary for callouts */
  medianW2Retention: Rate
  medianW4Retention: Rate
}

// ─── Participation Depth ───────────────────────────────────────────────────

export interface DepthBucket {
  /** Human-readable label, e.g. "1 activity", "2–4", "5–9", "10+" */
  label: string
  /** Minimum activities in bucket (for sorting/threshold logic) */
  minActivities: number
  count: Count
  /** Fraction of all active members */
  shareOfActive: Rate
  /** Whether this bucket is at or above the Highly Engaged threshold */
  isHighlyEngaged: boolean
}

export interface ParticipationDepthDataset {
  buckets: DepthBucket[]
  activitiesPerActiveMember: number
  history: Array<{ date: DateString; avgActivitiesPerActiveMember: number }>
}

// ─── Activity Supply ───────────────────────────────────────────────────────

export interface ActivitySupplyDataset {
  eligibleActivitiesPerMember: number
  membersWithZeroAvailable: Count
  membersWithZeroAvailablePct: Rate
  activitySupplyCoverage: Rate
  history: Array<{
    date: DateString
    eligiblePerMember: number
    coveragePct: Rate
    membersWithZero: Count
  }>
}

// ─── Activity Mix ──────────────────────────────────────────────────────────

export interface ActivityType {
  /** Stable key — never rename once shipped */
  key: string
  /** Display name */
  label: string
  /** Share of total available supply */
  supplyShare: Rate
  /** Share of total completions */
  completionShare: Rate
}

export interface ActivityMixDataset {
  types: ActivityType[]
  history: Array<{
    date: DateString
    types: Array<{ key: string; completionShare: Rate }>
  }>
}

// ─── Activity Performance ──────────────────────────────────────────────────

export interface ActivityTypePerformance {
  key: string
  label: string
  totalAvailable: Count
  totalCompleted: Count
  completionRate: Rate
  avgCompletionRate7d?: number
  trend: TimePoint[]
}

export interface ActivityPerformanceDataset {
  types: ActivityTypePerformance[]
}

// ─── Experiments ───────────────────────────────────────────────────────────

export type ExperimentStatus = 'live' | 'completed' | 'planned'
export type ExperimentDecision = 'ship' | 'iterate' | 'stop' | 'continue' | null
export type DataMaturity = 'collecting' | 'directional' | 'decision-ready'
export type GuardrailState = 'healthy' | 'watch' | 'tripped' | 'n/a'

export interface ExperimentMetricResult {
  metricKey: string
  label: string
  observedLift: number | null
  /** Is the lift statistically significant at the configured threshold? */
  significant: boolean | null
  direction: 'up' | 'down' | 'flat' | null
}

export interface Experiment {
  id: string
  name: string
  hypothesis: string
  status: ExperimentStatus
  rolloutPct: number | null
  startDate: DateString
  endDate: DateString | null
  /** ISO-8601 date of expected or actual decision */
  decisionDate: DateString | null
  primaryMetric: ExperimentMetricResult
  secondaryMetrics: ExperimentMetricResult[]
  guardrailState: GuardrailState
  guardrailDetails?: string
  maturity: DataMaturity
  decision: ExperimentDecision
  /** Filled for completed experiments */
  learnings?: string
  /** What changed as a result */
  outcome?: string
  /** Exposure — number of unique members in experiment */
  exposureN: Count | null
}

export interface ExperimentsDataset {
  experiments: Experiment[]
}

// ─── Full dashboard data bundle (loaded at runtime) ─────────────────────────

export interface DashboardData {
  manifest: Manifest
  p0: P0Dataset
  lifecycle: MemberLifecycleDataset
  activation: ActivationDataset
  retention: RetentionDataset
  depth: ParticipationDepthDataset
  supply: ActivitySupplyDataset
  mix: ActivityMixDataset
  performance: ActivityPerformanceDataset
  experiments: ExperimentsDataset
}
