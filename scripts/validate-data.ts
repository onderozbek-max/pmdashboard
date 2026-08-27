#!/usr/bin/env tsx
/**
 * Dashboard data validator.
 * Runs at CI time before any deployment.
 * Fails loudly (exit 1) on malformed data — no silent acceptance.
 *
 * Usage: npm run validate-data
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const DATA_DIR = join(process.cwd(), 'data')

let errors: string[] = []
let warnings: string[] = []
let passed = 0

function err(msg: string) { errors.push(`  ✗ ${msg}`) }
function warn(msg: string) { warnings.push(`  ⚠ ${msg}`) }
function ok(msg: string) { passed++; process.stdout.write(`  ✓ ${msg}\n`) }

function loadJson<T>(file: string): T | null {
  const path = join(DATA_DIR, file)
  if (!existsSync(path)) {
    err(`Missing required file: ${file}`)
    return null
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    err(`Invalid JSON in ${file}`)
    return null
  }
}

function isValidDate(s: unknown): boolean {
  if (typeof s !== 'string') return false
  return /^\d{4}-\d{2}(-\d{2})?$/.test(s)
}

function isRate(v: unknown): boolean {
  return typeof v === 'number' && v >= 0 && v <= 1
}

function isCount(v: unknown): boolean {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0
}

function checkChronological(dates: string[], context: string) {
  for (let i = 1; i < dates.length; i++) {
    if (dates[i] <= dates[i - 1]) {
      err(`${context}: dates not in ascending order at index ${i} (${dates[i - 1]} → ${dates[i]})`)
      return
    }
  }
  ok(`${context}: dates chronologically ordered`)
}

function checkDuplicates(ids: string[], context: string) {
  const seen = new Set<string>()
  const dupes: string[] = []
  for (const id of ids) {
    if (seen.has(id)) dupes.push(id)
    seen.add(id)
  }
  if (dupes.length > 0) err(`${context}: duplicate IDs: ${dupes.join(', ')}`)
  else ok(`${context}: no duplicate IDs`)
}

// ─── Required files ───────────────────────────────────────────────────────────

const REQUIRED_FILES = [
  'manifest.json',
  'p0-metrics.json',
  'member-lifecycle.json',
  'activation.json',
  'cohort-retention.json',
  'participation-depth.json',
  'activity-supply.json',
  'activity-mix.json',
  'activity-performance.json',
  'experiments.json',
]

console.log('\n📋 Validating dashboard data...\n')
console.log('── Required files ──')
for (const file of REQUIRED_FILES) {
  if (existsSync(join(DATA_DIR, file))) ok(file)
  else err(`Missing: ${file}`)
}

// ─── Manifest ─────────────────────────────────────────────────────────────────

console.log('\n── manifest.json ──')
const manifest = loadJson<Record<string, unknown>>('manifest.json')
if (manifest) {
  if (manifest.schemaVersion !== '1.0')
    err(`schemaVersion must be "1.0", got: ${manifest.schemaVersion}`)
  else ok('schemaVersion = 1.0')

  if (manifest.source !== 'synthetic' && manifest.source !== 'live')
    err(`source must be "synthetic" or "live", got: ${manifest.source}`)
  else ok(`source = "${manifest.source}"`)

  if (!isValidDate(manifest.dataThrough as string))
    err(`dataThrough is not a valid date: ${manifest.dataThrough}`)
  else ok(`dataThrough = ${manifest.dataThrough}`)

  if (!isValidDate(manifest.generatedAt as string) &&
      typeof manifest.generatedAt === 'string' && !manifest.generatedAt.includes('T'))
    warn(`generatedAt is not an ISO datetime: ${manifest.generatedAt}`)

  if (typeof manifest.freshnessThresholdHours !== 'number' || manifest.freshnessThresholdHours <= 0)
    err('freshnessThresholdHours must be a positive number')
  else ok('freshnessThresholdHours valid')

  if (!manifest.targets || typeof manifest.targets !== 'object')
    err('targets must be an object')
  else {
    const targets = manifest.targets as Record<string, unknown>
    for (const [key, target] of Object.entries(targets)) {
      const t = target as Record<string, unknown>
      if (typeof t.value !== 'number') err(`targets.${key}.value must be a number`)
      if (!isValidDate(t.byDate as string)) err(`targets.${key}.byDate is not a valid date`)
    }
    ok(`targets validated (${Object.keys(targets).length} targets)`)
  }

  if (!Array.isArray(manifest.annotations))
    err('annotations must be an array')
  else {
    const annIds = (manifest.annotations as Array<Record<string, unknown>>).map(a => a.id as string)
    checkDuplicates(annIds, 'annotations')
    for (const ann of manifest.annotations as Array<Record<string, unknown>>) {
      if (!isValidDate(ann.date as string)) err(`annotation ${ann.id}: invalid date ${ann.date}`)
      if (!['launch', 'experiment', 'milestone', 'incident'].includes(ann.category as string))
        err(`annotation ${ann.id}: invalid category ${ann.category}`)
    }
    ok('annotation categories valid')
  }
}

// ─── P0 Metrics ───────────────────────────────────────────────────────────────

console.log('\n── p0-metrics.json ──')
const p0 = loadJson<Record<string, unknown>>('p0-metrics.json')
if (p0) {
  const requiredKeys = [
    'totalMembers', 'monthlyActiveMembers', 'highlyEngagedMembers',
    'newMemberActivationRate', 'repeatParticipationRate', 'activitySupplyCoverage',
  ]
  for (const key of requiredKeys) {
    if (!(key in p0)) { err(`Missing P0 metric: ${key}`); continue }
    const snap = p0[key] as Record<string, unknown>
    if (typeof snap.current !== 'number') err(`${key}.current is not a number`)
    // prior/change/changePct may be null when no historical comparison is available
    // (e.g. activitySupplyCoverage has no point-in-time snapshots). null is valid here;
    // the UI renders "—" for null deltas rather than a false +0pp.
    if (snap.prior !== null && typeof snap.prior !== 'number')
      err(`${key}.prior must be a number or null, got: ${snap.prior}`)
    else if (snap.prior === null)
      warn(`${key}.prior is null — no historical comparison available (expected for metrics without point-in-time snapshots)`)
    if (!['up', 'down', 'flat'].includes(snap.direction as string))
      err(`${key}.direction must be up|down|flat, got: ${snap.direction}`)
    if (!Array.isArray(snap.history)) err(`${key}.history must be an array`)
    else {
      const histDates = (snap.history as Array<Record<string, unknown>>).map(h => h.date as string)
      checkChronological(histDates, `${key}.history`)
    }

    // Rate metrics must be in [0,1] (prior may be null when no comparison exists)
    if (['newMemberActivationRate', 'repeatParticipationRate', 'activitySupplyCoverage'].includes(key)) {
      if (!isRate(snap.current)) err(`${key}.current must be in [0,1], got: ${snap.current}`)
      if (snap.prior !== null && !isRate(snap.prior)) err(`${key}.prior must be in [0,1] or null, got: ${snap.prior}`)
    }
    ok(`${key} validated`)
  }
}

// ─── Experiments ──────────────────────────────────────────────────────────────

console.log('\n── experiments.json ──')
const exps = loadJson<Record<string, unknown>>('experiments.json')
const VALID_STATUSES = ['live', 'completed', 'planned']
const VALID_DECISIONS = ['ship', 'iterate', 'stop', 'continue', null]
const VALID_MATURITIES = ['collecting', 'directional', 'decision-ready']
const VALID_GUARDRAILS = ['healthy', 'watch', 'tripped', 'n/a']

if (exps && Array.isArray((exps as Record<string, unknown[]>).experiments)) {
  const experiments = (exps as { experiments: Array<Record<string, unknown>> }).experiments
  checkDuplicates(experiments.map(e => e.id as string), 'experiments')

  for (const exp of experiments) {
    const ctx = `experiment ${exp.id}`
    if (!VALID_STATUSES.includes(exp.status as string))
      err(`${ctx}: invalid status "${exp.status}"`)
    if (!VALID_DECISIONS.includes(exp.decision as string | null))
      err(`${ctx}: invalid decision "${exp.decision}"`)
    if (!VALID_MATURITIES.includes(exp.maturity as string))
      err(`${ctx}: invalid maturity "${exp.maturity}"`)
    if (!VALID_GUARDRAILS.includes(exp.guardrailState as string))
      err(`${ctx}: invalid guardrailState "${exp.guardrailState}"`)
    if (!isValidDate(exp.startDate as string))
      err(`${ctx}: invalid startDate "${exp.startDate}"`)
    if (exp.status === 'completed' && !exp.learnings)
      warn(`${ctx}: completed experiment has no learnings`)
    if (exp.status === 'completed' && exp.decision === null)
      warn(`${ctx}: completed experiment has no decision`)
  }
  ok(`experiments validated (${experiments.length} experiments)`)
}

// ─── Retention ────────────────────────────────────────────────────────────────

// Minimum cohort size for reliable rate estimates.
// IMPLEMENTATION DEFAULT: 100. Requires product/data-science confirmation.
const COHORT_MIN_N = 100

console.log('\n── cohort-retention.json ──')
const retention = loadJson<Record<string, unknown>>('cohort-retention.json')
if (retention && Array.isArray((retention as Record<string, unknown[]>).cohorts)) {
  const cohorts = (retention as { cohorts: Array<Record<string, unknown>> }).cohorts
  let smallCohortCount = 0
  for (const cohort of cohorts) {
    const n = cohort.startSize as number
    if (typeof n !== 'number' || n < 0)
      err(`cohort ${cohort.cohortLabel}: startSize must be a non-negative number, got: ${n}`)
    else if (n < COHORT_MIN_N) {
      warn(`cohort ${cohort.cohortLabel}: startSize=${n} < COHORT_MIN_N=${COHORT_MIN_N} — retention rates are statistically unreliable`)
      smallCohortCount++
    }
    for (const week of ['w1', 'w2', 'w4', 'w8', 'w12']) {
      const v = cohort[week]
      if (v !== null && !isRate(v))
        err(`cohort ${cohort.cohortLabel}: ${week} must be null or [0,1], got: ${v}`)
      // Catch the missing→zero failure mode: 0% retention for tiny cohorts is suspicious
      if (v === 0 && typeof n === 'number' && n < COHORT_MIN_N)
        warn(`cohort ${cohort.cohortLabel} ${week}: value=0 with N=${n} — verify this is genuine 0% and not missing data coerced to zero`)
    }
  }
  ok(`cohort retention validated (${cohorts.length} cohorts, ${smallCohortCount} below min-N threshold)`)
}

// ─── Depth buckets ────────────────────────────────────────────────────────────

console.log('\n── participation-depth.json ──')
const depth = loadJson<Record<string, unknown>>('participation-depth.json')
if (depth && Array.isArray((depth as Record<string, unknown[]>).buckets)) {
  const buckets = (depth as { buckets: Array<Record<string, unknown>> }).buckets
  const totalShare = buckets.reduce((s, b) => s + (b.shareOfActive as number), 0)
  if (Math.abs(totalShare - 1.0) > 0.02)
    warn(`participation-depth: bucket shareOfActive values sum to ${totalShare.toFixed(3)}, expected ~1.0`)
  else ok('participation-depth bucket shares sum to ~1.0')
}

// ─── Activity rates ───────────────────────────────────────────────────────────

console.log('\n── activity-performance.json ──')
const perf = loadJson<Record<string, unknown>>('activity-performance.json')
if (perf && Array.isArray((perf as Record<string, unknown[]>).types)) {
  const types = (perf as { types: Array<Record<string, unknown>> }).types
  for (const t of types) {
    if (!isRate(t.completionRate))
      err(`activity type ${t.key}: completionRate must be in [0,1], got: ${t.completionRate}`)
  }
  ok(`activity performance validated (${types.length} types)`)
}

// ─── Activation null fields ───────────────────────────────────────────────────

console.log('\n── activation.json (null field audit) ──')
const activation = loadJson<Record<string, unknown>>('activation.json')
if (activation) {
  // joinFlowCompletionRate and medianDaysToFirstParticipation are legitimately null when the
  // underlying data source is not yet available. Validate that null is explicit — not 0.
  const jfcr = activation.joinFlowCompletionRate
  if (jfcr === 0)
    warn('activation.joinFlowCompletionRate is 0 — verify this is genuine 0%, not missing data coerced to zero')
  else if (jfcr === null)
    warn('activation.joinFlowCompletionRate is null (unavailable) — UI should render "—", not 0%')
  else if (typeof jfcr === 'number' && isRate(jfcr))
    ok(`joinFlowCompletionRate = ${(jfcr * 100).toFixed(1)}%`)
  else
    err(`joinFlowCompletionRate must be a rate [0,1] or null, got: ${jfcr}`)

  const mdtfp = activation.medianDaysToFirstParticipation
  if (mdtfp === null)
    warn('activation.medianDaysToFirstParticipation is null (unavailable) — UI should render "—", not 0')
  else if (typeof mdtfp === 'number' && mdtfp >= 0)
    ok(`medianDaysToFirstParticipation = ${mdtfp}d`)
  else
    err(`medianDaysToFirstParticipation must be a non-negative number or null, got: ${mdtfp}`)
}

// ─── Supply history ───────────────────────────────────────────────────────────

console.log('\n── activity-supply.json (history audit) ──')
const supplyForValidation = loadJson<Record<string, unknown>>('activity-supply.json')
if (supplyForValidation) {
  const hist = supplyForValidation.history as unknown[]
  if (!Array.isArray(hist))
    err('activity-supply.history must be an array')
  else if (hist.length === 0)
    warn('activity-supply.history is empty — chart will show "Historical data not yet available". This is expected when tracking has just begun.')
  else if (hist.length === 1)
    warn('activity-supply.history has only 1 point — chart requires ≥2 points to render')
  else
    ok(`activity-supply.history has ${hist.length} data points`)
}

// ─── NaN / Infinity guard ─────────────────────────────────────────────────────

console.log('\n── NaN / Infinity audit ──')
function hasNaNOrInfinity(obj: unknown, path = ''): string[] {
  const issues: string[] = []
  if (typeof obj === 'number') {
    if (!isFinite(obj) || isNaN(obj)) issues.push(`${path} = ${obj}`)
  } else if (Array.isArray(obj)) {
    obj.forEach((v, i) => issues.push(...hasNaNOrInfinity(v, `${path}[${i}]`)))
  } else if (obj !== null && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>))
      issues.push(...hasNaNOrInfinity(v, path ? `${path}.${k}` : k))
  }
  return issues
}

const dataFiles = [
  ['p0-metrics.json', p0],
  ['activation.json', activation],
  ['cohort-retention.json', retention],
  ['activity-supply.json', supplyForValidation],
] as const

for (const [fname, data] of dataFiles) {
  if (!data) continue
  const badPaths = hasNaNOrInfinity(data)
  if (badPaths.length > 0) {
    for (const p of badPaths) err(`${fname}: NaN or Infinity at ${p}`)
  } else {
    ok(`${fname}: no NaN/Infinity values`)
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(50))
console.log(`\n✓ ${passed} checks passed`)
if (warnings.length > 0) {
  console.log(`⚠ ${warnings.length} warning(s):`)
  warnings.forEach(w => console.log(w))
}
if (errors.length > 0) {
  console.log(`\n✗ ${errors.length} error(s) found:\n`)
  errors.forEach(e => console.log(e))
  console.log('\nValidation FAILED. Fix errors before deploying.\n')
  process.exit(1)
} else {
  console.log('\n✅ Validation passed. Data is ready for deployment.\n')
}
