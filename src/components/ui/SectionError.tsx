interface SectionErrorProps {
  section: string
  message?: string
}

export default function SectionError({ section, message }: SectionErrorProps) {
  return (
    <div className="section-error" role="alert">
      <div className="section-error__icon" aria-hidden="true">⚠</div>
      <p className="section-error__title">{section} could not be loaded</p>
      <p className="section-error__message">
        {message ?? 'This section is temporarily unavailable. Other sections are not affected.'}
      </p>
    </div>
  )
}
