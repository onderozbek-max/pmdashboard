/**
 * Tiny inline sparkline — custom SVG, no chart library.
 * Accessible: aria-hidden since the enclosing MetricCard provides context.
 */

interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  color?: string
  /** If true, fills area under the line */
  filled?: boolean
  /** Optional target line value */
  target?: number
}

export default function Sparkline({
  data,
  width = 80,
  height = 28,
  color = 'var(--chart-1)',
  filled = true,
  target,
}: SparklineProps) {
  if (!data || data.length < 2) return null

  const pad = 2
  const w = width - pad * 2
  const h = height - pad * 2

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const x = (i: number) => pad + (i / (data.length - 1)) * w
  const y = (v: number) => pad + h - ((v - min) / range) * h

  const areaPath = [
    `M ${x(0)},${y(data[0])}`,
    ...data.slice(1).map((v, i) => `L ${x(i + 1)},${y(v)}`),
    `L ${x(data.length - 1)},${pad + h}`,
    `L ${x(0)},${pad + h}`,
    'Z',
  ].join(' ')

  const linePath = [
    `M ${x(0)},${y(data[0])}`,
    ...data.slice(1).map((v, i) => `L ${x(i + 1)},${y(v)}`),
  ].join(' ')

  const uid = Math.random().toString(36).slice(2)
  const gradId = `spark-grad-${uid}`

  // Target line
  const targetY = target !== undefined ? y(Math.max(min, Math.min(max, target))) : null

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      focusable="false"
      overflow="visible"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18"/>
          <stop offset="100%" stopColor={color} stopOpacity="0.02"/>
        </linearGradient>
      </defs>

      {/* Target reference */}
      {targetY !== null && (
        <line
          x1={pad}
          y1={targetY}
          x2={pad + w}
          y2={targetY}
          stroke="var(--color-caution)"
          strokeWidth="1"
          strokeDasharray="3 2"
          opacity="0.7"
        />
      )}

      {/* Fill area */}
      {filled && (
        <path d={areaPath} fill={`url(#${gradId})`}/>
      )}

      {/* Line */}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* End dot */}
      <circle
        cx={x(data.length - 1)}
        cy={y(data[data.length - 1])}
        r="2.5"
        fill={color}
      />
    </svg>
  )
}
