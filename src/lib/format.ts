/**
 * Formatting utilities — single source of truth for display formatting.
 * Components must not implement their own formatting logic.
 */

const numberFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const compactFmt = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
const pctFmt    = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 })
const pctFmt0   = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 0 })
const decFmt1   = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
const decFmt2   = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

/** Format an integer count, e.g. 1,234,567 */
export function fmtCount(n: number): string {
  return numberFmt.format(Math.round(n))
}

/** Format a large number compactly, e.g. 1.2M */
export function fmtCompact(n: number): string {
  return compactFmt.format(n)
}

/** Format a rate [0,1] as percentage, e.g. "73.4%" */
export function fmtPct(r: number): string {
  return pctFmt.format(r)
}

/** Format a rate [0,1] as rounded percentage, e.g. "73%" */
export function fmtPct0(r: number): string {
  return pctFmt0.format(r)
}

/** Format a decimal to 1 decimal place */
export function fmtDecimal(n: number, places = 1): string {
  return places === 2 ? decFmt2.format(n) : decFmt1.format(n)
}

/** Format a change as +/−X% */
export function fmtChangePct(changePct: number): string {
  const sign = changePct >= 0 ? '+' : '−'
  return `${sign}${pctFmt.format(Math.abs(changePct))}`
}

/** Format a change as +/−N (integer) */
export function fmtChangeCount(change: number): string {
  const sign = change >= 0 ? '+' : '−'
  return `${sign}${numberFmt.format(Math.abs(Math.round(change)))}`
}

/** Format a relative change for narrative use: e.g. "up 4.2%" or "down 1.8%" */
export function fmtChangeNarrative(changePct: number, positiveDirection: 'up' | 'down'): {
  text: string
  isPositive: boolean
} {
  const absChange = Math.abs(changePct)
  const direction = changePct >= 0 ? 'up' : 'down'
  const isPositive = direction === positiveDirection
  return {
    text: `${direction} ${pctFmt.format(absChange)}`,
    isPositive,
  }
}

/** Format a metric value based on its unit type */
export function fmtMetricValue(value: number, unit: 'count' | 'rate' | 'pct' | 'days' | 'number'): string {
  switch (unit) {
    case 'count': return fmtCount(value)
    case 'rate':
    case 'pct':   return fmtPct(value)
    case 'days':  return `${decFmt1.format(value)}d`
    case 'number':return fmtDecimal(value)
    default:      return String(value)
  }
}

/** Format a date string (YYYY-MM) for display, e.g. "Mar 2024" */
export function fmtMonthLabel(dateStr: string): string {
  // Handle YYYY-MM format
  if (/^\d{4}-\d{2}$/.test(dateStr)) {
    const [year, month] = dateStr.split('-').map(Number)
    const d = new Date(year, month - 1, 1)
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  }
  // Handle YYYY-MM-DD
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

/** Format a date string for display, e.g. "Mar 15, 2024" */
export function fmtDate(dateStr: string): string {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Relative time, e.g. "2 hours ago", "3 days ago" */
export function fmtRelativeTime(dateStr: string): string {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return 'unknown'
  const now = Date.now()
  const diffMs = now - d.getTime()
  const diffH = diffMs / (1000 * 60 * 60)
  const diffD = diffH / 24

  if (diffH < 1) return 'less than an hour ago'
  if (diffH < 24) return `${Math.floor(diffH)} hour${Math.floor(diffH) === 1 ? '' : 's'} ago`
  if (diffD < 30) return `${Math.floor(diffD)} day${Math.floor(diffD) === 1 ? '' : 's'} ago`
  return fmtDate(dateStr)
}

/** Clamp a value to [min, max] */
export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}
