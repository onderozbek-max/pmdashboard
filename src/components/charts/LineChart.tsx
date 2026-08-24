/**
 * Custom SVG line chart — no chart library.
 * Fully accessible: semantic table provided for screen readers.
 * Supports multiple series, annotations, and target reference lines.
 */

import { useState, useId } from 'react'
import type { TimePoint, EventAnnotation, Target } from '../../types/data-contract'
import { fmtMonthLabel, fmtCompact } from '../../lib/format'
import './LineChart.css'

export interface LineSeries {
  key: string
  label: string
  data: TimePoint[]
  color: string
  dashed?: boolean
}

interface LineChartProps {
  series: LineSeries[]
  target?: Target
  annotations?: EventAnnotation[]
  height?: number
  /** How many x-axis labels to render (auto-spaced) */
  xLabelCount?: number
  title: string
  unit?: 'count' | 'pct'
}

const PAD = { top: 20, right: 24, bottom: 48, left: 56 }

function buildPath(points: Array<[number, number]>): string {
  if (points.length === 0) return ''
  return points
    .map(([x, y], i) => (i === 0 ? `M ${x},${y}` : `L ${x},${y}`))
    .join(' ')
}

export default function LineChart({
  series,
  target,
  annotations = [],
  height = 220,
  xLabelCount = 6,
  title,
  unit = 'count',
}: LineChartProps) {
  const [hoveredX, setHoveredX] = useState<number | null>(null)
  const [tooltipData, setTooltipData] = useState<{ x: number; y: number; date: string; values: Array<{ label: string; value: number; color: string }> } | null>(null)
  const uid = useId()

  if (!series.length || !series[0].data.length) return null

  // Merge all data to find bounds
  const allValues = series.flatMap(s => s.data.map(p => p.value))
  if (target) allValues.push(target.value)

  const rawMin = Math.min(...allValues)
  const rawMax = Math.max(...allValues)
  const valuePad = (rawMax - rawMin) * 0.12 || rawMax * 0.1
  const yMin = Math.max(0, rawMin - valuePad)
  const yMax = rawMax + valuePad

  const allDates = [...new Set(series.flatMap(s => s.data.map(p => p.date)))].sort()
  const xCount = allDates.length

  // Compute SVG dims (use container-relative 100% width via viewBox)
  const svgW = 600
  const svgH = height

  const plotW = svgW - PAD.left - PAD.right
  const plotH = svgH - PAD.top - PAD.bottom

  const xPos = (dateStr: string) => {
    const idx = allDates.indexOf(dateStr)
    return PAD.left + (idx / (xCount - 1)) * plotW
  }

  const yPos = (v: number) => {
    return PAD.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH
  }

  // Y axis grid lines
  const yTickCount = 4
  const yTicks = Array.from({ length: yTickCount + 1 }, (_, i) => {
    return yMin + (yMax - yMin) * (i / yTickCount)
  })

  // X axis labels (evenly spaced)
  const xLabelStep = Math.max(1, Math.floor(xCount / xLabelCount))
  const xLabels = allDates.filter((_, i) => i % xLabelStep === 0 || i === xCount - 1)

  // Target line y-position
  const targetY = target ? yPos(target.value) : null

  // Build SVG paths for each series
  const paths = series.map(s => {
    const pts = s.data
      .filter(p => allDates.includes(p.date))
      .map(p => [xPos(p.date), yPos(p.value)] as [number, number])
    return { ...s, pts }
  })

  // Hover handling
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const svgX = ((e.clientX - rect.left) / rect.width) * svgW
    const plotX = svgX - PAD.left
    const fraction = plotX / plotW
    const idx = Math.round(fraction * (xCount - 1))
    const safeIdx = Math.max(0, Math.min(xCount - 1, idx))
    const hoverDate = allDates[safeIdx]
    const hx = xPos(hoverDate)

    const values = series.map(s => {
      const pt = s.data.find(p => p.date === hoverDate)
      return { label: s.label, value: pt?.value ?? 0, color: s.color }
    })

    setHoveredX(hx)
    setTooltipData({ x: hx, y: 0, date: hoverDate, values })
  }

  const handleMouseLeave = () => {
    setHoveredX(null)
    setTooltipData(null)
  }

  return (
    <div className="line-chart">
      {/* Accessible table */}
      <table className="sr-only" aria-label={`${title} — data table`}>
        <thead>
          <tr>
            <th scope="col">Period</th>
            {series.map(s => <th key={s.key} scope="col">{s.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {allDates.map(date => (
            <tr key={date}>
              <td>{fmtMonthLabel(date)}</td>
              {series.map(s => {
                const pt = s.data.find(p => p.date === date)
                return <td key={s.key}>{pt ? fmtCompact(pt.value) : '—'}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* SVG chart */}
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        width="100%"
        height={svgH}
        role="img"
        aria-label={`${title} chart. Data table below.`}
        className="line-chart__svg"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <defs>
          {paths.map(s => (
            <linearGradient key={s.key} id={`${uid}-fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={s.dashed ? 0 : 0.12}/>
              <stop offset="100%" stopColor={s.color} stopOpacity="0"/>
            </linearGradient>
          ))}
        </defs>

        {/* Y grid lines */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line
              x1={PAD.left}
              y1={yPos(v)}
              x2={PAD.left + plotW}
              y2={yPos(v)}
              stroke="var(--border-subtle)"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 8}
              y={yPos(v)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize="10"
              fill="var(--text-tertiary)"
            >
              {unit === 'pct'
                ? `${(v * 100).toFixed(0)}%`
                : fmtCompact(v)}
            </text>
          </g>
        ))}

        {/* Target reference line */}
        {targetY !== null && target && (
          <g>
            <line
              x1={PAD.left}
              y1={targetY}
              x2={PAD.left + plotW}
              y2={targetY}
              stroke="var(--color-caution)"
              strokeWidth="1.5"
              strokeDasharray="5 3"
              opacity="0.8"
            />
            <text
              x={PAD.left + plotW + 4}
              y={targetY}
              dominantBaseline="middle"
              fontSize="9"
              fill="var(--color-caution)"
              opacity="0.9"
            >
              Target
            </text>
          </g>
        )}

        {/* Event annotations */}
        {annotations.map(ann => {
          const ax = xPos(ann.date.substring(0, 7))
          return (
            <g key={ann.id}>
              <line
                x1={ax}
                y1={PAD.top}
                x2={ax}
                y2={PAD.top + plotH}
                stroke="var(--text-tertiary)"
                strokeWidth="1"
                strokeDasharray="3 3"
                opacity="0.4"
              />
              <circle cx={ax} cy={PAD.top + 6} r="3" fill="var(--text-tertiary)" opacity="0.5"/>
            </g>
          )
        })}

        {/* Hover crosshair */}
        {hoveredX !== null && (
          <line
            x1={hoveredX}
            y1={PAD.top}
            x2={hoveredX}
            y2={PAD.top + plotH}
            stroke="var(--text-tertiary)"
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.5"
          />
        )}

        {/* Area fills (behind lines) */}
        {paths.map(s => {
          if (s.dashed || s.pts.length < 2) return null
          const areaPath = [
            `M ${s.pts[0][0]},${s.pts[0][1]}`,
            ...s.pts.slice(1).map(([x, y]) => `L ${x},${y}`),
            `L ${s.pts[s.pts.length - 1][0]},${PAD.top + plotH}`,
            `L ${s.pts[0][0]},${PAD.top + plotH}`,
            'Z',
          ].join(' ')
          return (
            <path
              key={`fill-${s.key}`}
              d={areaPath}
              fill={`url(#${uid}-fill-${s.key})`}
            />
          )
        })}

        {/* Lines */}
        {paths.map(s => (
          <path
            key={`line-${s.key}`}
            d={buildPath(s.pts)}
            fill="none"
            stroke={s.color}
            strokeWidth={s.dashed ? 1.5 : 2}
            strokeDasharray={s.dashed ? '5 3' : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* Hover dots */}
        {hoveredX !== null && tooltipData && paths.map(s => {
          const pt = s.data.find(p => p.date === tooltipData.date)
          if (!pt) return null
          return (
            <circle
              key={`dot-${s.key}`}
              cx={xPos(tooltipData.date)}
              cy={yPos(pt.value)}
              r="4"
              fill={s.color}
              stroke="var(--bg-surface)"
              strokeWidth="2"
            />
          )
        })}

        {/* X axis labels */}
        {xLabels.map(date => (
          <text
            key={date}
            x={xPos(date)}
            y={PAD.top + plotH + 18}
            textAnchor="middle"
            fontSize="10"
            fill="var(--text-tertiary)"
          >
            {fmtMonthLabel(date)}
          </text>
        ))}

        {/* X axis line */}
        <line
          x1={PAD.left}
          y1={PAD.top + plotH}
          x2={PAD.left + plotW}
          y2={PAD.top + plotH}
          stroke="var(--border-default)"
          strokeWidth="1"
        />
      </svg>

      {/* Tooltip */}
      {tooltipData && (
        <div
          className="line-chart__tooltip"
          aria-hidden="true"
          style={{ left: `${(tooltipData.x / svgW) * 100}%` }}
        >
          <div className="line-chart__tooltip-date">{fmtMonthLabel(tooltipData.date)}</div>
          {tooltipData.values.map(v => (
            <div key={v.label} className="line-chart__tooltip-row">
              <span className="line-chart__tooltip-dot" style={{ background: v.color }}/>
              <span className="line-chart__tooltip-label">{v.label}</span>
              <span className="line-chart__tooltip-value">
                {unit === 'pct' ? `${(v.value * 100).toFixed(1)}%` : fmtCompact(v.value)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      {series.length > 1 && (
        <div className="line-chart__legend" aria-hidden="true">
          {series.map(s => (
            <span key={s.key} className="line-chart__legend-item">
              <span
                className="line-chart__legend-line"
                style={{
                  background: s.dashed ? 'transparent' : s.color,
                  borderBottom: s.dashed ? `2px dashed ${s.color}` : 'none',
                }}
              />
              {s.label}
            </span>
          ))}
          {target && (
            <span className="line-chart__legend-item">
              <span
                className="line-chart__legend-line"
                style={{ borderBottom: '2px dashed var(--color-caution)' }}
              />
              Target
            </span>
          )}
        </div>
      )}
    </div>
  )
}
