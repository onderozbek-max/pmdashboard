/**
 * Statistical primitives for the deterministic insight engine.
 * No LLM dependency. Pure computation over time-series data.
 */

export interface RegressionResult {
  slope: number
  intercept: number
  r2: number
  /** Standard error of the slope */
  slopeSE: number
  /** t-statistic for slope */
  tStat: number
  n: number
}

/**
 * Ordinary least-squares linear regression on (x, y) pairs.
 * x values are typically time indices (0, 1, 2, …).
 */
export function linearRegression(ys: number[]): RegressionResult | null {
  const n = ys.length
  if (n < 3) return null

  const xs = ys.map((_, i) => i)

  const xMean = xs.reduce((a, b) => a + b, 0) / n
  const yMean = ys.reduce((a, b) => a + b, 0) / n

  let ssxx = 0, ssxy = 0, ssyy = 0
  for (let i = 0; i < n; i++) {
    ssxx += (xs[i] - xMean) ** 2
    ssxy += (xs[i] - xMean) * (ys[i] - yMean)
    ssyy += (ys[i] - yMean) ** 2
  }

  if (ssxx === 0) return null

  const slope = ssxy / ssxx
  const intercept = yMean - slope * xMean
  const r2 = ssyy > 0 ? ssxy ** 2 / (ssxx * ssyy) : 0

  // Residual standard error
  let sse = 0
  for (let i = 0; i < n; i++) {
    sse += (ys[i] - (slope * xs[i] + intercept)) ** 2
  }
  const mse = sse / (n - 2)
  const slopeSE = Math.sqrt(mse / ssxx)
  const tStat = slopeSE > 0 ? slope / slopeSE : 0

  return { slope, intercept, r2, slopeSE, tStat, n }
}

/**
 * Classify a trend based on slope t-statistic and r².
 * Returns a human-interpretable trend qualifier.
 */
export type TrendQualifier =
  | 'strong-up'
  | 'up'
  | 'flat'
  | 'down'
  | 'strong-down'
  | 'noisy'

export function qualifyTrend(reg: RegressionResult, relativeSlopeThreshold = 0.02): TrendQualifier {
  // If fit is poor (r² < 0.3), call it noisy
  if (reg.r2 < 0.3 && Math.abs(reg.tStat) < 2) return 'noisy'

  // Normalize slope relative to mean of the series
  // (slope is in raw units; we need relative change per step)
  const mean = reg.intercept + reg.slope * (reg.n / 2)
  if (mean === 0) return 'flat'
  const relativeSlope = reg.slope / Math.abs(mean)

  if (Math.abs(reg.tStat) < 1.5) return 'flat'
  if (Math.abs(relativeSlope) < relativeSlopeThreshold) return 'flat'

  if (relativeSlope > relativeSlopeThreshold * 2.5 && reg.tStat > 2.5) return 'strong-up'
  if (relativeSlope > relativeSlopeThreshold) return 'up'
  if (relativeSlope < -relativeSlopeThreshold * 2.5 && reg.tStat < -2.5) return 'strong-down'
  if (relativeSlope < -relativeSlopeThreshold) return 'down'
  return 'flat'
}

/**
 * Detect a meaningful change between two periods.
 * Returns null if the change is within noise floor.
 */
export interface ChangeDetection {
  changeAbsolute: number
  changePct: number
  isMeaningful: boolean
  magnitude: 'large' | 'medium' | 'small'
}

export function detectChange(
  current: number,
  prior: number,
  noiseFloorRelative = 0.02
): ChangeDetection {
  const changeAbsolute = current - prior
  const changePct = prior !== 0 ? (current - prior) / Math.abs(prior) : 0
  const magnitude = Math.abs(changePct)

  return {
    changeAbsolute,
    changePct,
    isMeaningful: magnitude >= noiseFloorRelative,
    magnitude: magnitude > 0.1 ? 'large' : magnitude > 0.04 ? 'medium' : 'small',
  }
}

/**
 * Project the next N values using a fitted linear regression.
 * Returns { projected, lowerCI, upperCI } for each step.
 * Uses the slope SE to produce a rough 80% confidence interval.
 */
export interface Projection {
  step: number
  projected: number
  lowerCI: number
  upperCI: number
}

export function projectLinear(reg: RegressionResult, steps: number, tMult = 1.28): Projection[] {
  return Array.from({ length: steps }, (_, i) => {
    const xNext = reg.n + i
    const projected = reg.slope * xNext + reg.intercept
    const margin = tMult * reg.slopeSE * Math.sqrt(1 + 1 / reg.n + (xNext - reg.n / 2) ** 2 / reg.n)
    return {
      step: i + 1,
      projected,
      lowerCI: projected - margin,
      upperCI: projected + margin,
    }
  })
}

/** Simple rolling mean */
export function rollingMean(values: number[], window: number): number[] {
  return values.map((_, i) => {
    const start = Math.max(0, i - window + 1)
    const slice = values.slice(start, i + 1)
    return slice.reduce((a, b) => a + b, 0) / slice.length
  })
}

/** Extract the numeric values from a TimePoint array */
export function extractValues(series: Array<{ value: number }>): number[] {
  return series.map(p => p.value)
}
