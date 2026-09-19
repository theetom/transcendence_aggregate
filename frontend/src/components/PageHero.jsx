function PageHero({ eyebrow, title, lead, className = '', children }) {
  const heroClassName = className ? `page-hero ${className}` : 'page-hero'

  return (
    <section className={heroClassName}>
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {lead ? <p className="page-hero__lead">{lead}</p> : null}
      {children}
    </section>
  )
}

export default PageHero
