interface SkeletonProps {
  width?: string
  height?: string
  borderRadius?: string
  className?: string
}

export function Skeleton({ width = '100%', height = '1rem', borderRadius = 'var(--radius-sm)', className }: SkeletonProps) {
  return (
    <div
      className={`skeleton ${className ?? ''}`}
      style={{ width, height, borderRadius }}
      aria-hidden="true"
    />
  )
}

export function MetricCardSkeleton() {
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-5)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
      }}
      aria-label="Loading metric"
      aria-busy="true"
    >
      <Skeleton width="60%" height="12px"/>
      <Skeleton width="45%" height="36px" borderRadius="var(--radius-md)"/>
      <Skeleton width="40%" height="16px"/>
    </div>
  )
}

export function ChartSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div
      aria-label="Loading chart"
      aria-busy="true"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
    >
      <Skeleton height={`${height}px`} borderRadius="var(--radius-lg)"/>
    </div>
  )
}
