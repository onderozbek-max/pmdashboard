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

const DATA_DIR = join(process.cwd(), 'public', 'data')

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
    if (typeof snap.prior !== 'number') err(`${key}.prior is not a number`)
    if (!['up', 'down', 'flat'].includes(snap.direction as string))
      err(`${key}.direction must be up|down|flat, got: ${snap.direction}`)
    if (!Array.isArray(snap.history)) err(`${key}.history must be an array`)
    else {
      const histDates = (snap.history as Array<Record<string, unknown>>).map(h => h.date as string)
      checkChronological(histDates, `${key}.history`)
    }

    // Rate metrics must be in [0,1]
    if (['newMemberActivationRate', 'repeatParticipationRate', 'activitySupplyCoverage'].includes(key)) {
      if (!isRate(snap.current)) err(`${key}.current must be in [0,1], got: ${snap.current}`)
      if (!isRate(snap.prior)) err(`${key}.prior must be in [0,1], got: ${snap.prior}`)
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

console.log('\n── cohort-retention.json ──')
const retention = loadJson<Record<string, unknown>>('cohort-retention.json')
if (retention && Array.isArray((retention as Record<string, unknown[]>).cohorts)) {
  const cohorts = (retention as { cohorts: Array<Record<string, unknown>> }).cohorts
  for (const cohort of cohorts) {
    for (const week of ['w1', 'w2', 'w4', 'w8', 'w12']) {
      const v = cohort[week]
      if (v !== null && !isRate(v))
        err(`cohort ${cohort.cohortLabel}: ${week} must be null or [0,1], got: ${v}`)
    }
  }
  ok(`cohort retention validated (${cohorts.length} cohorts)`)
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
