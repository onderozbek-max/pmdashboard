/**
 * Static data loader.
 * Fetches dashboard JSON files from /data/ via fetch().
 * Each section loads independently — one failure does not block others.
 *
 * ARCHITECTURE: The browser only reads /data/*.json — no direct data-source access.
 */

import type { DashboardData } from '../types/data-contract'

export type LoadResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }

async function loadJson<T>(path: string): Promise<LoadResult<T>> {
  try {
    const res = await fetch(path)
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status} loading ${path}` }
    }
    const data = await res.json() as T
    return { ok: true, data }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `Failed to load ${path}: ${msg}` }
  }
}

export interface DataBundle {
  manifest:     LoadResult<DashboardData['manifest']>
  p0:           LoadResult<DashboardData['p0']>
  lifecycle:    LoadResult<DashboardData['lifecycle']>
  activation:   LoadResult<DashboardData['activation']>
  retention:    LoadResult<DashboardData['retention']>
  depth:        LoadResult<DashboardData['depth']>
  supply:       LoadResult<DashboardData['supply']>
  mix:          LoadResult<DashboardData['mix']>
  performance:  LoadResult<DashboardData['performance']>
  experiments:  LoadResult<DashboardData['experiments']>
}

/** Load all dashboard data in parallel. Individual failures are isolated. */
export async function loadAllData(): Promise<DataBundle> {
  const base = import.meta.env.BASE_URL ?? '/'
  const d = (file: string) => `${base}data/${file}`

  const [
    manifest, p0, lifecycle, activation,
    retention, depth, supply, mix, performance, experiments,
  ] = await Promise.all([
    loadJson<DashboardData['manifest']>(d('manifest.json')),
    loadJson<DashboardData['p0']>(d('p0-metrics.json')),
    loadJson<DashboardData['lifecycle']>(d('member-lifecycle.json')),
    loadJson<DashboardData['activation']>(d('activation.json')),
    loadJson<DashboardData['retention']>(d('cohort-retention.json')),
    loadJson<DashboardData['depth']>(d('participation-depth.json')),
    loadJson<DashboardData['supply']>(d('activity-supply.json')),
    loadJson<DashboardData['mix']>(d('activity-mix.json')),
    loadJson<DashboardData['performance']>(d('activity-performance.json')),
    loadJson<DashboardData['experiments']>(d('experiments.json')),
  ])

  return {
    manifest, p0, lifecycle, activation,
    retention, depth, supply, mix, performance, experiments,
  }
}

/** Unwrap a LoadResult or return a fallback for rendering */
export function unwrap<T>(result: LoadResult<T>): T | null {
  return result.ok ? result.data : null
}

/** Check if all critical data loaded successfully */
export function isCriticalDataLoaded(bundle: DataBundle): boolean {
  return bundle.manifest.ok && bundle.p0.ok
}
