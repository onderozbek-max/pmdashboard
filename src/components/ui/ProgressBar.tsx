import { clamp } from '../../lib/format'

interface ProgressBarProps {
  value: number   // 0-1
  label: string   // accessible label
  height?: number
  color?: string
}

export default function ProgressBar({ value, label, height = 4, color = 'var(--chart-1)' }: ProgressBarProps) {
  const pct = clamp(value, 0, 1) * 100

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      style={{
        height: `${height}px`,
        background: 'var(--bg-inset)',
        borderRadius: 'var(--radius-full)',
        overflow: 'hidden',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${pct}%`,
          background: color,
          borderRadius: 'var(--radius-full)',
          transition: 'width 0.4s var(--ease-out)',
        }}
        aria-hidden="true"
      />
    </div>
  )
}
