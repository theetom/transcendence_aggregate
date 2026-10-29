function FieldError({ id, message, className = '', label }) {
  if (!message) return null

  return (
    <p id={id} className={`status-banner ${className}`.trim()} role="alert">
      {label ? <><strong>{label}</strong>{' '}</> : null}
      {message}
    </p>
  )
}

export default FieldError
