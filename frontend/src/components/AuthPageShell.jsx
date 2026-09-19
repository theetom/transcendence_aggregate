function AuthPageShell({
  introEyebrow,
  introTitle,
  introDescription,
  bullets,
  formEyebrow,
  formTitle,
  status,
  children,
}) {
  return (
    <div className="content-frame auth-shell">
      <div className="auth-shell__frame auth-grid">
        <section className="auth-card">
          <div className="auth-card__title">
            <p className="eyebrow">{introEyebrow}</p>
            <h1>{introTitle}</h1>
            <p>{introDescription}</p>
          </div>

          <ul className="bullet-list" style={{ marginTop: '24px' }}>
            {bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
        </section>

        <section className="auth-card">
          <p className="eyebrow">{formEyebrow}</p>
          <h3>{formTitle}</h3>
          {children}
          <p className="status-banner auth-card__status">{status}</p>
        </section>
      </div>
    </div>
  )
}

export default AuthPageShell
