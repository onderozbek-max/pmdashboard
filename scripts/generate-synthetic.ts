#!/usr/bin/env tsx
/**
 * Synthetic data generator for the MMC Community Dashboard.
 *
 * Generates realistic-looking but entirely FABRICATED data.
 * All output is clearly marked source: "synthetic".
 * NEVER introduce real member counts, real metrics, or real business data.
 *
 * Usage: npm run generate-data
 * Output: public/data/*.json
 */

import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const OUTPUT_DIR = join(process.cwd(), 'public', 'data')
mkdirSync(OUTPUT_DIR, { recursive: true })

// ─── Helpers ─────────────────────────────────────────────────────────────────

function write(filename: string, data: unknown) {
  const path = join(OUTPUT_DIR, filename)
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf8')
  console.log(`✓ ${filename}`)
}

/** Generate monthly date strings going back N months from a given date */
function monthlyDates(fromDate: Date, months: number): string[] {
  const dates: string[] = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(fromDate)
    d.setMonth(d.getMonth() - i)
    dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return dates
}

/** Smooth random walk with drift and noise */
function randomWalk(
  start: number,
  steps: number,
  drift: number,      // per-step additive drift (e.g. 0.02 = +2%/step)
  noiseFraction: number  // noise as fraction of current value
): number[] {
  const values: number[] = [start]
  for (let i = 1; i < steps; i++) {
    const prev = values[i - 1]
    const noise = (Math.random() - 0.5) * 2 * noiseFraction * prev
    const next = prev * (1 + drift) + noise
    values.push(Math.max(0, next))
  }
  return values
}

/** Clamp to [0,1] */
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

// ─── Config ───────────────────────────────────────────────────────────────────

// Reference date: use current date minus a few days to simulate "recent" data
const NOW = new Date('2026-08-24')
const DATA_THROUGH = new Date(NOW)
DATA_THROUGH.setDate(DATA_THROUGH.getDate() - 3) // 3-day lag

const MONTHS = 18
const dates = monthlyDates(DATA_THROUGH, MONTHS)
const currentPeriodLabel = 'MoM'

// ─── Manifest ─────────────────────────────────────────────────────────────────

const manifest = {
  schemaVersion: '1.0',
  source: 'synthetic',
  dataThrough: DATA_THROUGH.toISOString().split('T')[0],
  generatedAt: NOW.toISOString(),
  freshnessThresholdHours: 72,
  currentPeriodLabel: 'vs. last month',
  priorPeriodLabel: 'Prior month',
  targets: {
    monthlyActiveMembers: {
      value: 95000,
      byDate: '2026-12-31',
    },
    newMemberActivationRate: {
      value: 0.72,
      byDate: '2026-12-31',
    },
    highlyEngagedMembers: {
      value: 22000,
      byDate: '2026-12-31',
    },
  },
  annotations: [
    {
      id: 'ann-1',
      date: '2025-11-01',
      label: 'New Activity Types Launch',
      category: 'launch',
      description: 'Trivia and Quick Poll formats launched to all members',
    },
    {
      id: 'ann-2',
      date: '2026-02-01',
      label: 'Onboarding Redesign',
      category: 'launch',
      description: 'Participatory onboarding flow redesigned',
    },
    {
      id: 'ann-3',
      date: '2026-05-15',
      label: 'Q2 Activation Experiment',
      category: 'experiment',
      description: 'Activation nudge experiment began',
    },
  ],
}

write('manifest.json', manifest)

// ─── P0 Metrics ───────────────────────────────────────────────────────────────

// Total Members: strong upward growth
const totalMembersHistory = randomWalk(520000, MONTHS, 0.018, 0.003)
// MAU: growing but with a dip mid-series
const mauValues = totalMembersHistory.map((tm, i) => {
  const baseRate = 0.62 + (i / MONTHS) * 0.08
  const dip = i >= 6 && i <= 9 ? -0.04 : 0 // mid-period dip
  return tm * clamp01(baseRate + dip + (Math.random() - 0.5) * 0.02)
})
// Highly Engaged: growing but slower
const heValues = mauValues.map((mau, i) => {
  const rate = 0.20 + (i / MONTHS) * 0.05 + (Math.random() - 0.5) * 0.02
  return mau * clamp01(rate)
})

// Activation Rate: was low, improving
const activationRates = randomWalk(0.51, MONTHS, 0.008, 0.02).map(clamp01)
// Repeat Participation Rate: slight decline recently → caution
const repeatRates = (() => {
  const base = randomWalk(0.65, MONTHS - 3, 0.005, 0.02).map(clamp01)
  // Last 3 months: slight decline
  const last3 = [base[base.length - 1] * 0.96, base[base.length - 1] * 0.93, base[base.length - 1] * 0.91]
  return [...base, ...last3]
})()
// Activity Supply Coverage: constrained
const supplyRates = randomWalk(0.78, MONTHS, 0.003, 0.025).map(clamp01)

function makeSnapshot(history: number[], values = history) {
  const current = values[values.length - 1]
  const prior = values[values.length - 2]
  const change = current - prior
  const changePct = prior > 0 ? (current - prior) / prior : 0
  return {
    current: Math.round(current),
    prior: Math.round(prior),
    change: Math.round(change),
    changePct: parseFloat(changePct.toFixed(4)),
    direction: change > prior * 0.005 ? 'up' : change < -prior * 0.005 ? 'down' : 'flat',
    history: dates.map((date, i) => ({ date, value: Math.round(values[i]) })),
  }
}

function makeRateSnapshot(values: number[]) {
  const current = values[values.length - 1]
  const prior = values[values.length - 2]
  const change = current - prior
  const changePct = prior > 0 ? (current - prior) / prior : 0
  return {
    current: parseFloat(current.toFixed(4)),
    prior: parseFloat(prior.toFixed(4)),
    change: parseFloat(change.toFixed(4)),
    changePct: parseFloat(changePct.toFixed(4)),
    direction: change > 0.005 ? 'up' : change < -0.005 ? 'down' : 'flat',
    history: dates.map((date, i) => ({ date, value: parseFloat(values[i].toFixed(4)) })),
  }
}

const p0Metrics = {
  totalMembers:         makeSnapshot(totalMembersHistory),
  monthlyActiveMembers: makeSnapshot(mauValues),
  highlyEngagedMembers: makeSnapshot(heValues),
  newMemberActivationRate:  makeRateSnapshot(activationRates),
  repeatParticipationRate:  makeRateSnapshot(repeatRates),
  activitySupplyCoverage:   makeRateSnapshot(supplyRates),
}

write('p0-metrics.json', p0Metrics)

// ─── Member Lifecycle ──────────────────────────────────────────────────────────

const currentTM  = Math.round(totalMembersHistory[MONTHS - 1])
const currentMAU = Math.round(mauValues[MONTHS - 1])
const currentHE  = Math.round(heValues[MONTHS - 1])
const currentActivated = Math.round(currentMAU * 0.88)
const currentParticipated = Math.round(currentMAU * 0.72)
const currentRepeated = Math.round(currentMAU * repeatRates[MONTHS - 1])

const lifecycle = {
  stages: [
    { stage: 'Joined',        count: currentTM },
    { stage: 'Activated',     count: currentActivated },
    { stage: 'Participated',  count: currentParticipated },
    { stage: 'Repeated',      count: currentRepeated },
    { stage: 'Highly Engaged',count: currentHE },
  ],
  mauHistory: dates.map((date, i) => ({ date, value: Math.round(mauValues[i]) })),
}

write('member-lifecycle.json', lifecycle)

// ─── Activation ───────────────────────────────────────────────────────────────

const newMembersThisPeriod = Math.round(currentTM * 0.025)
const activation = {
  cohortLabel: dates[MONTHS - 1],
  steps: [
    {
      step: 'Joined Community',
      count: newMembersThisPeriod,
      conversionFromTop: 1.0,
      conversionFromPrior: 1.0,
    },
    {
      step: 'Completed Join Flow',
      count: Math.round(newMembersThisPeriod * 0.83),
      conversionFromTop: 0.83,
      conversionFromPrior: 0.83,
    },
    {
      step: 'Completed Onboarding',
      count: Math.round(newMembersThisPeriod * 0.67),
      conversionFromTop: 0.67,
      conversionFromPrior: 0.81,
    },
    {
      step: 'First Participation',
      count: Math.round(newMembersThisPeriod * activationRates[MONTHS - 1]),
      conversionFromTop: parseFloat(activationRates[MONTHS - 1].toFixed(3)),
      conversionFromPrior: parseFloat((activationRates[MONTHS - 1] / 0.67).toFixed(3)),
      medianDaysFromJoin: 4.2,
    },
    {
      step: 'First Research Activity',
      count: Math.round(newMembersThisPeriod * activationRates[MONTHS - 1] * 0.68),
      conversionFromTop: parseFloat((activationRates[MONTHS - 1] * 0.68).toFixed(3)),
      conversionFromPrior: 0.68,
    },
  ],
  newMembersThisPeriod,
  joinFlowCompletionRate: 0.83,
  onboardingCompletionRate: 0.81,
  medianDaysToFirstParticipation: 4.2,
  firstResearchActivityCompletionRate: 0.68,
}

write('activation.json', activation)

// ─── Cohort Retention ─────────────────────────────────────────────────────────

const cohortDates = monthlyDates(DATA_THROUGH, 12)
const cohorts = cohortDates.map((date, i) => {
  const weeksAvailable = Math.floor((MONTHS - i) * 4.3)
  const startSize = Math.round(8000 + Math.random() * 4000)
  const base = 0.55 + Math.random() * 0.12
  return {
    cohortLabel: date,
    startDate: date,
    startSize,
    w1:  weeksAvailable >= 1  ? parseFloat(clamp01(base + 0.18 + Math.random() * 0.05).toFixed(3)) : null,
    w2:  weeksAvailable >= 2  ? parseFloat(clamp01(base + 0.08 + Math.random() * 0.05).toFixed(3)) : null,
    w4:  weeksAvailable >= 4  ? parseFloat(clamp01(base - 0.04 + Math.random() * 0.06).toFixed(3)) : null,
    w8:  weeksAvailable >= 8  ? parseFloat(clamp01(base - 0.14 + Math.random() * 0.06).toFixed(3)) : null,
    w12: weeksAvailable >= 12 ? parseFloat(clamp01(base - 0.22 + Math.random() * 0.07).toFixed(3)) : null,
  }
})

const retention = {
  cohorts,
  medianW2Retention: 0.64,
  medianW4Retention: 0.52,
}

write('cohort-retention.json', retention)

// ─── Participation Depth ──────────────────────────────────────────────────────

const depth = {
  buckets: [
    { label: '1 activity', minActivities: 1, count: Math.round(currentMAU * 0.28), shareOfActive: 0.28, isHighlyEngaged: false },
    { label: '2–4',        minActivities: 2, count: Math.round(currentMAU * 0.37), shareOfActive: 0.37, isHighlyEngaged: false },
    { label: '5–9',        minActivities: 5, count: Math.round(currentMAU * 0.22), shareOfActive: 0.22, isHighlyEngaged: true  },
    { label: '10+',        minActivities: 10,count: Math.round(currentMAU * 0.13), shareOfActive: 0.13, isHighlyEngaged: true  },
  ],
  activitiesPerActiveMember: 4.3,
  history: dates.map((date, i) => ({
    date,
    avgActivitiesPerActiveMember: parseFloat((3.1 + (i / MONTHS) * 1.8 + (Math.random() - 0.5) * 0.4).toFixed(2)),
  })),
}

write('participation-depth.json', depth)

// ─── Activity Supply ──────────────────────────────────────────────────────────

const supply = {
  eligibleActivitiesPerMember: 3.2,
  membersWithZeroAvailable: Math.round(currentMAU * (1 - supplyRates[MONTHS - 1])),
  membersWithZeroAvailablePct: parseFloat((1 - supplyRates[MONTHS - 1]).toFixed(4)),
  activitySupplyCoverage: parseFloat(supplyRates[MONTHS - 1].toFixed(4)),
  history: dates.map((date, i) => ({
    date,
    eligiblePerMember: parseFloat((2.1 + (i / MONTHS) * 1.4 + (Math.random() - 0.5) * 0.3).toFixed(2)),
    coveragePct: parseFloat(supplyRates[i].toFixed(4)),
    membersWithZero: Math.round(mauValues[i] * (1 - supplyRates[i])),
  })),
}

write('activity-supply.json', supply)

// ─── Activity Mix ─────────────────────────────────────────────────────────────

const mix = {
  types: [
    { key: 'research-survey', label: 'Research Surveys', supplyShare: 0.35, completionShare: 0.42 },
    { key: 'ihut',            label: 'IHUTs',            supplyShare: 0.22, completionShare: 0.28 },
    { key: 'quick-poll',      label: 'Quick Polls',      supplyShare: 0.25, completionShare: 0.18 },
    { key: 'trivia',          label: 'Trivia',           supplyShare: 0.12, completionShare: 0.09 },
    { key: 'other',           label: 'Other',            supplyShare: 0.06, completionShare: 0.03 },
  ],
  history: dates.slice(-6).map((date, i) => ({
    date,
    types: [
      { key: 'research-survey', completionShare: parseFloat((0.38 + (Math.random() - 0.5) * 0.06).toFixed(3)) },
      { key: 'ihut',            completionShare: parseFloat((0.26 + (Math.random() - 0.5) * 0.05).toFixed(3)) },
      { key: 'quick-poll',      completionShare: parseFloat((0.20 + (Math.random() - 0.5) * 0.04).toFixed(3)) },
      { key: 'trivia',          completionShare: parseFloat((0.10 + (Math.random() - 0.5) * 0.03).toFixed(3)) },
      { key: 'other',           completionShare: parseFloat((0.06 + (Math.random() - 0.5) * 0.02).toFixed(3)) },
    ],
  })),
}

write('activity-mix.json', mix)

// ─── Activity Performance ──────────────────────────────────────────────────────

const perf = {
  types: [
    {
      key: 'research-survey',
      label: 'Research Surveys',
      totalAvailable: 12400,
      totalCompleted: 9920,
      completionRate: 0.80,
      avgCompletionRate7d: 0.81,
      trend: dates.slice(-8).map((date, i) => ({
        date,
        value: parseFloat((0.78 + (Math.random() - 0.5) * 0.05).toFixed(3)),
      })),
    },
    {
      key: 'ihut',
      label: 'IHUTs',
      totalAvailable: 3200,
      totalCompleted: 2816,
      completionRate: 0.88,
      avgCompletionRate7d: 0.87,
      trend: dates.slice(-8).map((date, i) => ({
        date,
        value: parseFloat((0.86 + (Math.random() - 0.5) * 0.04).toFixed(3)),
      })),
    },
    {
      key: 'quick-poll',
      label: 'Quick Polls',
      totalAvailable: 18000,
      totalCompleted: 8100,
      completionRate: 0.45,
      avgCompletionRate7d: 0.44,
      trend: dates.slice(-8).map((date, i) => ({
        date,
        value: parseFloat((0.43 + (Math.random() - 0.5) * 0.06).toFixed(3)),
      })),
    },
    {
      key: 'trivia',
      label: 'Trivia',
      totalAvailable: 8800,
      totalCompleted: 3168,
      completionRate: 0.36,
      avgCompletionRate7d: 0.38,
      trend: dates.slice(-8).map((date, i) => ({
        date,
        value: parseFloat((0.36 + (Math.random() - 0.5) * 0.05).toFixed(3)),
      })),
    },
    {
      key: 'other',
      label: 'Other',
      totalAvailable: 1200,
      totalCompleted: 444,
      completionRate: 0.37,
      avgCompletionRate7d: 0.36,
      trend: dates.slice(-8).map((date, i) => ({
        date,
        value: parseFloat((0.35 + (Math.random() - 0.5) * 0.07).toFixed(3)),
      })),
    },
  ],
}

write('activity-performance.json', perf)

// ─── Experiments ──────────────────────────────────────────────────────────────

const experiments = {
  experiments: [
    {
      id: 'exp-001',
      name: 'Personalized Activity Recommendations',
      hypothesis:
        'Showing members activity recommendations based on past completions will increase Monthly Active Members by ≥5% and Repeat Participation Rate by ≥3pp within 30 days.',
      status: 'live',
      rolloutPct: 50,
      startDate: '2026-07-15',
      endDate: null,
      decisionDate: '2026-09-01',
      primaryMetric: {
        metricKey: 'monthlyActiveMembers',
        label: 'Monthly Active Members',
        observedLift: 0.031,
        significant: null,
        direction: 'up',
      },
      secondaryMetrics: [
        {
          metricKey: 'repeatParticipationRate',
          label: 'Repeat Participation Rate',
          observedLift: 0.018,
          significant: null,
          direction: 'up',
        },
        {
          metricKey: 'activitiesPerActiveMember',
          label: 'Activities per Active Member',
          observedLift: 0.042,
          significant: null,
          direction: 'up',
        },
      ],
      guardrailState: 'healthy',
      maturity: 'directional',
      decision: null,
      exposureN: 38200,
    },
    {
      id: 'exp-002',
      name: 'Activation Nudge — Day 3 Email',
      hypothesis:
        'Sending a personalized "your first activity is ready" email on day 3 post-join will increase New Member Activation Rate by ≥8pp in the 14-day window.',
      status: 'live',
      rolloutPct: 100,
      startDate: '2026-05-15',
      endDate: null,
      decisionDate: '2026-09-15',
      primaryMetric: {
        metricKey: 'newMemberActivationRate',
        label: 'New Member Activation Rate',
        observedLift: 0.074,
        significant: true,
        direction: 'up',
      },
      secondaryMetrics: [
        {
          metricKey: 'timeToFirstParticipation',
          label: 'Time to First Participation',
          observedLift: -0.21,
          significant: true,
          direction: 'down',
        },
      ],
      guardrailState: 'healthy',
      maturity: 'decision-ready',
      decision: null,
      exposureN: 14600,
    },
    {
      id: 'exp-003',
      name: 'Activity Bundle Grouping',
      hypothesis:
        'Presenting complementary activities as a grouped bundle will increase Activities per Active Member without harming completion rates.',
      status: 'completed',
      rolloutPct: 100,
      startDate: '2026-03-01',
      endDate: '2026-05-31',
      decisionDate: '2026-06-01',
      primaryMetric: {
        metricKey: 'activitiesPerActiveMember',
        label: 'Activities per Active Member',
        observedLift: 0.12,
        significant: true,
        direction: 'up',
      },
      secondaryMetrics: [
        {
          metricKey: 'completionRateResearch',
          label: 'Research Survey Completion',
          observedLift: -0.02,
          significant: false,
          direction: 'flat',
        },
      ],
      guardrailState: 'healthy',
      maturity: 'decision-ready',
      decision: 'ship',
      learnings:
        'Bundled activity grouping increased avg activities per active member by 12% (significant at 95%). No measurable harm to completion quality.',
      outcome:
        'Shipped to 100% of members in June 2026. Activity depth metric tracked as primary KPI going forward.',
      exposureN: 72000,
    },
    {
      id: 'exp-004',
      name: 'Supply Visibility Widget — Zero Activities State',
      hypothesis:
        'Showing members a "new activities coming soon" message when supply is zero reduces dormancy and improves W2 retention vs. showing nothing.',
      status: 'planned',
      rolloutPct: null,
      startDate: '2026-09-10',
      endDate: null,
      decisionDate: '2026-11-01',
      primaryMetric: {
        metricKey: 'w2Retention',
        label: 'W2 Participation Retention',
        observedLift: null,
        significant: null,
        direction: null,
      },
      secondaryMetrics: [
        {
          metricKey: 'repeatParticipationRate',
          label: 'Repeat Participation Rate',
          observedLift: null,
          significant: null,
          direction: null,
        },
      ],
      guardrailState: 'n/a',
      maturity: 'collecting',
      decision: null,
      exposureN: null,
    },
    {
      id: 'exp-005',
      name: 'Onboarding Flow Simplification',
      hypothesis:
        'Reducing the onboarding flow from 7 steps to 4 steps will increase Join Flow Completion and Onboarding Completion without harming first-participation quality.',
      status: 'completed',
      rolloutPct: 100,
      startDate: '2026-01-15',
      endDate: '2026-03-15',
      decisionDate: '2026-03-20',
      primaryMetric: {
        metricKey: 'joinFlowCompletionRate',
        label: 'Join Flow Completion',
        observedLift: 0.09,
        significant: true,
        direction: 'up',
      },
      secondaryMetrics: [
        {
          metricKey: 'onboardingCompletionRate',
          label: 'Onboarding Completion',
          observedLift: 0.14,
          significant: true,
          direction: 'up',
        },
        {
          metricKey: 'newMemberActivationRate',
          label: 'Activation Rate',
          observedLift: 0.06,
          significant: true,
          direction: 'up',
        },
      ],
      guardrailState: 'healthy',
      maturity: 'decision-ready',
      decision: 'ship',
      learnings:
        'Simplifying onboarding from 7 to 4 steps improved completion rates significantly across all three funnel stages. No drop in first-activity quality observed.',
      outcome:
        'Shipped February 2026. New onboarding is now the baseline. This explains the step-change improvement in activation rate observed in the March 2026 cohort.',
      exposureN: 22000,
    },
  ],
}

write('experiments.json', experiments)

console.log('\n✅ Synthetic data generation complete.')
console.log(`   Output: ${OUTPUT_DIR}`)
console.log('   All data is SYNTHETIC — clearly marked source: "synthetic".\n')
