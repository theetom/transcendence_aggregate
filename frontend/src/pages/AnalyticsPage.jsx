import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Button from '../components/Button'
import PageHero from '../components/PageHero'
import {
  analyticsDateRange,
  analyticsFilterError,
  analyticsFilterKey,
  analyticsSearchParams,
  createAnalyticsDownload,
  getRecipeAnalytics,
  readAnalyticsParams,
} from '../data/recipeAnalytics'
import useLiveRefresh from '../hooks/useLiveRefresh'
import '../styles/recipe-analytics.css'

const numberFormat = new Intl.NumberFormat()
const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const shortDateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'UTC' })

function formatDate(date, short = false) {
  return (short ? shortDateFormat : dateFormat).format(new Date(`${date}T12:00:00Z`))
}

function formatRating(value) {
  return value === null ? 'Not rated' : `${value.toFixed(2)} / 5`
}

function categoryLabel(data) {
  if (data.filters.category === null) return 'All categories'
  return data.categories.find(category => category.id === data.filters.category)?.name || 'Unavailable category'
}

function snapshotLabel(data) {
  return `${formatDate(data.filters.start)} – ${formatDate(data.filters.end)} UTC · ${categoryLabel(data)}${data.filters.q ? ` · Title: “${data.filters.q}”` : ''} · ${data.filters.rating ? `${data.filters.rating}-star reviews` : 'All ratings'}`
}

function ActivityChart({ daily, onDate, canFilter }) {
  const titleId = useId()
  const svgRef = useRef(null)
  const [selectedDate, setSelectedDate] = useState('')
  const [mode, setMode] = useState('activity')
  const [showRecipes, setShowRecipes] = useState(true)
  const [showReviews, setShowReviews] = useState(true)
  const selectedIndex = Math.max(0, daily.findIndex(day => day.date === selectedDate))
  const selected = daily[selectedIndex]
  const width = 920
  const height = 280
  const left = 48
  const right = 24
  const top = 22
  const bottom = 44
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom
  const largestCount = Math.max(1, ...daily.flatMap(day => [showRecipes ? day.recipes_created : 0, showReviews ? day.reviews : 0]))
  const maximum = mode === 'rating' ? 5 : Math.max(4, Math.ceil(largestCount / 4) * 4)
  const ticks = mode === 'rating' ? [0, 1, 2, 3, 4, 5] : [0, maximum / 4, maximum / 2, maximum * 3 / 4, maximum]
  const x = index => daily.length === 1 ? left + plotWidth / 2 : left + index * plotWidth / (daily.length - 1)
  const y = value => top + plotHeight - value / maximum * plotHeight
  const labelIndices = [...new Set([0, Math.floor((daily.length - 1) / 4), Math.floor((daily.length - 1) / 2), Math.floor((daily.length - 1) * 3 / 4), daily.length - 1])]

  function pathFor(field) {
    let connected = false
    return daily.map((day, index) => {
      if (day[field] === null) {
        connected = false
        return ''
      }
      const point = `${connected ? 'L' : 'M'}${x(index)},${y(day[field])}`
      connected = true
      return point
    }).join(' ')
  }

  function movePoint(event, index) {
    let nextIndex = index
    if (event.key === 'ArrowLeft') nextIndex = Math.max(0, index - 1)
    else if (event.key === 'ArrowRight') nextIndex = Math.min(daily.length - 1, index + 1)
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = daily.length - 1
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (canFilter) onDate(daily[index].date)
      return
    } else return
    event.preventDefault()
    setSelectedDate(daily[nextIndex].date)
    svgRef.current?.querySelectorAll('.analytics-chart__point')[nextIndex]?.focus()
  }

  return (
    <section className="analytics-page__panel analytics-page__panel--wide" aria-labelledby={`${titleId}-heading`}>
      <div className="analytics-page__heading">
        <h2 id={`${titleId}-heading`}>Daily activity</h2>
        <div className="analytics-page__legend" aria-label="Chart view">
          <Button variant="ghost" aria-pressed={mode === 'activity'} onClick={() => setMode('activity')}>Activity</Button>
          <Button variant="ghost" aria-pressed={mode === 'rating'} onClick={() => setMode('rating')}>Average rating</Button>
        </div>
      </div>
      <p>Hover or focus a date for details. Select it to filter to that day. Use the left and right arrow keys to move between dates.</p>
      {mode === 'activity' ? (
        <div className="analytics-page__legend" aria-label="Visible activity series">
          <Button variant="ghost" aria-pressed={showRecipes} onClick={() => setShowRecipes(value => !value)}>
            <span className="analytics-page__legend-key analytics-page__legend-key--recipes" aria-hidden="true" />Recipes created
          </Button>
          <Button variant="ghost" aria-pressed={showReviews} onClick={() => setShowReviews(value => !value)}>
            <span className="analytics-page__legend-key analytics-page__legend-key--reviews" aria-hidden="true" />Reviews
          </Button>
        </div>
      ) : <p>Daily average of reviews in the selected range. Days without reviews have no rating point.</p>}
      <div className="analytics-page__chart-scroll">
        <svg ref={svgRef} className="analytics-chart" viewBox={`0 0 ${width} ${height}`} role="group" aria-labelledby={`${titleId}-title ${titleId}-description`}>
          <title id={`${titleId}-title`}>{mode === 'rating' ? 'Daily average review rating' : 'Daily recipes created and reviews'}</title>
          <desc id={`${titleId}-description`}>Dates use UTC. Each date is keyboard selectable. The complete data is also available in the table below.</desc>
          {ticks.map(value => (
            <g key={value} aria-hidden="true">
              <line className="analytics-chart__grid" x1={left} x2={width - right} y1={y(value)} y2={y(value)} />
              <text x={left - 10} y={y(value) + 4} textAnchor="end">{numberFormat.format(value)}</text>
            </g>
          ))}
          {labelIndices.map(index => (
            <text key={index} x={x(index)} y={height - 14} textAnchor={daily.length === 1 ? 'middle' : index === 0 ? 'start' : index === daily.length - 1 ? 'end' : 'middle'} aria-hidden="true">{formatDate(daily[index].date, true)}</text>
          ))}
          {mode === 'activity' && showRecipes && <path className="analytics-chart__line analytics-chart__line--recipes" d={pathFor('recipes_created')} aria-hidden="true" />}
          {mode === 'activity' && showReviews && <path className="analytics-chart__line analytics-chart__line--reviews" d={pathFor('reviews')} aria-hidden="true" />}
          {mode === 'rating' && <path className="analytics-chart__line analytics-chart__line--rating" d={pathFor('average_rating')} aria-hidden="true" />}
          {daily.map((day, index) => {
            const detail = `${formatDate(day.date)} UTC: ${day.recipes_created} recipes created, ${day.reviews} reviews, ${formatRating(day.average_rating)}.`
            const hitLeft = index === 0 ? left : (x(index - 1) + x(index)) / 2
            const hitRight = index === daily.length - 1 ? width - right : (x(index) + x(index + 1)) / 2
            return (
              <g key={day.date} className="analytics-chart__point" role="button" tabIndex={index === selectedIndex ? 0 : -1}
                aria-label={`${detail} Select to show this day.`} aria-pressed={index === selectedIndex} aria-disabled={!canFilter}
                onPointerEnter={() => setSelectedDate(day.date)} onFocus={() => setSelectedDate(day.date)}
                onKeyDown={event => movePoint(event, index)} onClick={() => { if (canFilter) onDate(day.date) }}>
                <title>{detail}</title>
                <rect className="analytics-chart__hit" x={hitLeft} y={top} width={hitRight - hitLeft} height={plotHeight} />
                {mode === 'activity' && showRecipes && <circle className="analytics-chart__dot--recipes" cx={x(index)} cy={y(day.recipes_created)} r={index === selectedIndex || daily.length === 1 ? 4 : 2} aria-hidden="true" />}
                {mode === 'activity' && showReviews && <circle className="analytics-chart__dot--reviews" cx={x(index)} cy={y(day.reviews)} r={index === selectedIndex || daily.length === 1 ? 4 : 2} aria-hidden="true" />}
                {mode === 'rating' && day.average_rating !== null && <circle className="analytics-chart__dot--rating" cx={x(index)} cy={y(day.average_rating)} r={index === selectedIndex || daily.length === 1 ? 4 : 2} aria-hidden="true" />}
              </g>
            )
          })}
        </svg>
      </div>
      <p className="analytics-page__chart-detail" role="status">
        <strong>{formatDate(selected.date)} UTC</strong> · {numberFormat.format(selected.recipes_created)} recipes created · {numberFormat.format(selected.reviews)} reviews · {formatRating(selected.average_rating)}
      </p>
      <details>
        <summary>View daily data table</summary>
        <div className="analytics-page__table-scroll">
          <table>
            <caption>Daily data for the displayed range. Recipe creation and review dates are counted independently.</caption>
            <thead><tr><th scope="col">Date (UTC)</th><th scope="col">Recipes created</th><th scope="col">Reviews</th><th scope="col">Average rating</th><th scope="col">Filter</th></tr></thead>
            <tbody>{daily.map(day => (
              <tr key={day.date}><th scope="row">{day.date}</th><td>{numberFormat.format(day.recipes_created)}</td><td>{numberFormat.format(day.reviews)}</td><td>{formatRating(day.average_rating)}</td>
                <td><Button variant="ghost" disabled={!canFilter} aria-label={`Show ${formatDate(day.date)} only`} onClick={() => onDate(day.date)}>Show day</Button></td></tr>
            ))}</tbody>
          </table>
        </div>
      </details>
    </section>
  )
}

function RatingChart({ data, onRating, canFilter }) {
  const titleId = useId()
  const maximum = Math.max(1, ...data.rating_distribution.map(item => item.review_count))
  const total = data.rating_distribution.reduce((sum, item) => sum + item.review_count, 0)
  return (
    <section className="analytics-page__panel" aria-labelledby={titleId}>
      <h2 id={titleId}>Review ratings</h2>
      <p>All review ratings in the date range and recipe filters, including when a star filter is selected. Select a bar to filter reviews; select it again to show all ratings.</p>
      {total === 0 && <p>No reviews match this range and recipe filters.</p>}
      <ul className="analytics-page__bars" aria-label="Review count for each rating">
        {data.rating_distribution.map(item => (
          <li key={item.rating}>
            <button type="button" className="analytics-page__bar" disabled={!canFilter} aria-pressed={data.filters.rating === item.rating} onClick={() => onRating(item.rating)}>
              <span className="analytics-page__bar-label">{item.rating} {item.rating === 1 ? 'star' : 'stars'}</span>
              <span className="analytics-page__bar-value">{numberFormat.format(item.review_count)} reviews</span>
              <span className="analytics-page__bar-track" aria-hidden="true"><span className="analytics-page__bar-fill" style={{ width: `${item.review_count / maximum * 100}%` }} /></span>
            </button>
          </li>
        ))}
      </ul>
      <details>
        <summary>View ratings data table</summary>
        <div className="analytics-page__table-scroll"><table>
          <caption>All grades, before the optional star filter.</caption>
          <thead><tr><th scope="col">Rating</th><th scope="col">Reviews</th></tr></thead>
          <tbody>{data.rating_distribution.map(item => <tr key={item.rating}><th scope="row">{item.rating} / 5</th><td>{numberFormat.format(item.review_count)}</td></tr>)}</tbody>
        </table></div>
      </details>
    </section>
  )
}

function TopRecipes({ recipes }) {
  const titleId = useId()
  const maximum = Math.max(1, ...recipes.map(recipe => recipe.review_count))
  return (
    <section className="analytics-page__panel" aria-labelledby={titleId}>
      <h2 id={titleId}>Most reviewed recipes</h2>
      <p>Up to 10 recipes ranked by matching reviews in the displayed range. Select a recipe to open it.</p>
      {recipes.length === 0 ? <p>No reviewed recipes match these filters.</p> : (
        <ul className="analytics-page__bars" aria-label="Recipes ranked by review count">
          {recipes.map((recipe, index) => (
            <li key={recipe.id}><Link className="analytics-page__bar" to={`/recipe/${recipe.id}`}>
              <span className="analytics-page__bar-label">{index + 1}. {recipe.title}</span>
              <span className="analytics-page__bar-value">{numberFormat.format(recipe.review_count)} reviews · {recipe.average_rating.toFixed(2)} / 5</span>
              <span className="analytics-page__bar-track" aria-hidden="true"><span className="analytics-page__bar-fill analytics-page__bar-fill--sage" style={{ width: `${recipe.review_count / maximum * 100}%` }} /></span>
            </Link></li>
          ))}
        </ul>
      )}
      <details>
        <summary>View recipe rankings table</summary>
        <div className="analytics-page__table-scroll"><table>
          <caption>Recipe rankings use the displayed date range, category, title and star filters.</caption>
          <thead><tr><th scope="col">Recipe</th><th scope="col">Reviews</th><th scope="col">Average rating</th></tr></thead>
          <tbody>{recipes.map(recipe => <tr key={recipe.id}><th scope="row"><Link to={`/recipe/${recipe.id}`}>{recipe.title}</Link></th><td>{numberFormat.format(recipe.review_count)}</td><td>{formatRating(recipe.average_rating)}</td></tr>)}</tbody>
        </table></div>
      </details>
    </section>
  )
}

function AnalyticsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = useMemo(() => readAnalyticsParams(searchParams), [searchParams])
  const filterKey = analyticsFilterKey(filters)
  const filterError = analyticsFilterError(filters)
  const [reload, setReload] = useState(0)
  const [formError, setFormError] = useState(null)
  const [downloadError, setDownloadError] = useState('')
  const [state, setState] = useState({ data: null, key: '', requestKey: '', error: '', refreshing: false })
  const downloads = useRef(new Set())

  useEffect(() => () => {
    for (const download of downloads.current) {
      window.clearTimeout(download.timer)
      URL.revokeObjectURL(download.url)
    }
    downloads.current.clear()
  }, [])

  useLiveRefresh(async signal => {
    setState(previous => ({ ...previous, requestKey: filterKey, error: '', refreshing: true }))
    try {
      const data = await getRecipeAnalytics(filters, signal)
      if (!signal.aborted) setState({ data, key: filterKey, requestKey: filterKey, error: '', refreshing: false })
    } catch (error) {
      if (!signal.aborted) setState(previous => ({ ...previous, requestKey: filterKey, error: error.message || 'Analytics is unavailable right now.', refreshing: false }))
    }
  }, { enabled: !filterError, refreshKey: `${filterKey}|${reload}`, immediate: true })

  const data = state.data
  const matchesFilters = Boolean(data && state.key === filterKey && !filterError)
  const requestError = state.requestKey === filterKey ? state.error : ''
  const isRefreshing = !filterError && (state.requestKey !== filterKey || state.refreshing)
  const categories = data?.categories || []
  const selectedCategory = categories.find(category => String(category.id) === filters.category)
  const localFilterError = formError?.key === filterKey ? formError.message : ''

  function applyFilters(next) {
    const message = analyticsFilterError(next)
    setFormError(message ? { key: filterKey, message } : null)
    if (message) return
    setDownloadError('')
    setSearchParams(analyticsSearchParams(next))
  }

  function submitFilters(event) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    applyFilters({ start: fields.get('start'), end: fields.get('end'), category: fields.get('category'), q: fields.get('q').trim(), rating: fields.get('rating') })
  }

  function download(format) {
    if (!matchesFilters) return
    setDownloadError('')
    let pending = null
    let anchor = null
    try {
      const file = createAnalyticsDownload(data, format)
      pending = { url: URL.createObjectURL(file.blob), timer: null }
      downloads.current.add(pending)
      anchor = document.createElement('a')
      anchor.href = pending.url
      anchor.download = file.filename
      document.body.append(anchor)
      anchor.click()
      const completed = pending
      completed.timer = window.setTimeout(() => {
        URL.revokeObjectURL(completed.url)
        downloads.current.delete(completed)
      }, 1000)
    } catch {
      if (pending) {
        URL.revokeObjectURL(pending.url)
        downloads.current.delete(pending)
      }
      setDownloadError('The analytics file could not be downloaded. Please try again.')
    } finally {
      anchor?.remove()
    }
  }

  return (
    <div className="content-frame analytics-page">
      <PageHero eyebrow="Recipe insights" title="A closer look at our kitchen." lead="Explore recipe activity and reviews, choose a date range, and download the results." />
      <section className="analytics-page__filters" aria-labelledby="analytics-filters-title">
        <div className="analytics-page__heading"><h2 id="analytics-filters-title">Choose your view</h2><p className="analytics-page__note">Dates are inclusive and use UTC. Maximum range: 366 days.</p></div>
        <div className="analytics-page__presets" aria-label="Date range presets">
          {[7, 30, 90, 365].map(days => {
            const range = analyticsDateRange(days)
            return <Button key={days} variant="ghost" aria-pressed={filters.start === range.start && filters.end === range.end} onClick={() => applyFilters({ ...filters, ...range })}>Last {days} days</Button>
          })}
        </div>
        <form key={filterKey} onSubmit={submitFilters}>
          <div className="analytics-page__filter-fields">
            <label className="analytics-page__field">Start date<input name="start" type="date" defaultValue={filters.start} required /></label>
            <label className="analytics-page__field">End date<input name="end" type="date" defaultValue={filters.end} required /></label>
            <label className="analytics-page__field">Recipe category<select name="category" defaultValue={filters.category}>
              <option value="">All categories</option>
              {filters.category && <option key={filters.category} value={filters.category}>{selectedCategory?.name || 'Unavailable category'}</option>}
              {categories.filter(category => String(category.id) !== filters.category).map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select></label>
            <label className="analytics-page__field">Recipe title<input name="q" type="search" defaultValue={filters.q} placeholder="Search recipe titles" maxLength={200} /><small>Up to 100 characters.</small></label>
            <label className="analytics-page__field">Review stars<select name="rating" defaultValue={filters.rating}>
              <option value="">All ratings</option>
              {[1, 2, 3, 4, 5].map(rating => <option key={rating} value={rating}>{rating} {rating === 1 ? 'star' : 'stars'}</option>)}
            </select></label>
            <div className="analytics-page__field"><span>Apply changes</span><Button type="submit">Apply filters</Button></div>
          </div>
        </form>
        <div className="analytics-page__actions"><Button variant="ghost" onClick={() => applyFilters({ ...analyticsDateRange(), category: '', q: '', rating: '' })}>Clear filters</Button></div>
        <p className="analytics-page__note">Recipe totals include currently approved recipes. Recipe creation dates and review dates are counted independently, so reviews can belong to older recipes. The star filter applies only to reviews and their averages.</p>
        {(localFilterError || filterError) && <p className="form-message form-message--error" role="alert">{localFilterError || filterError}</p>}
      </section>
      <div className="analytics-page__toolbar">
        <div>
          <p className={`analytics-page__live${requestError || filterError || data && !matchesFilters ? ' analytics-page__live--stale' : ''}`}>{filterError ? 'Check the filters' : isRefreshing ? 'Refreshing…' : requestError ? 'Refresh unavailable' : data ? 'Live updates' : 'Waiting for data'}</p>
          <p className="analytics-page__note">Updates every 5 seconds while this page is visible.</p>
          {data && <p className="analytics-page__note">Snapshot: <time dateTime={data.generated_at}>{timeFormat.format(new Date(data.generated_at))} UTC</time></p>}
        </div>
        <div className="analytics-page__actions">
          <Button variant="ghost" disabled={Boolean(filterError) || isRefreshing} onClick={() => setReload(value => value + 1)}>Refresh</Button>
          <Button variant="secondary" disabled={!matchesFilters} onClick={() => download('csv')}>Export CSV</Button>
          <Button variant="secondary" disabled={!matchesFilters} onClick={() => download('json')}>Export JSON</Button>
        </div>
      </div>
      {requestError && <p className="form-message form-message--error" role="alert">{requestError}{data ? ' The last successful snapshot remains below; its generation time is shown above.' : ''}</p>}
      {downloadError && <p className="form-message form-message--error" role="alert">{downloadError}</p>}
      {data && <p className="analytics-page__note" role="status">{matchesFilters ? 'Displayed filters: ' : 'Previous snapshot — waiting for the requested filters. Displayed filters: '}{snapshotLabel(data)}{!matchesFilters ? '. Chart filters and downloads are unavailable until the requested data loads.' : ''}</p>}
      {!data && !requestError && !filterError && <p className="analytics-page__note" role="status">Loading recipe analytics…</p>}
      {data && <>
        <section className="analytics-page__metrics" aria-label="Displayed analytics summary">
          <article className="analytics-page__metric"><h2>Matching recipes</h2><strong>{numberFormat.format(data.summary.matching_recipes)}</strong><p>Current approved catalogue matching category and title, across all creation dates.</p></article>
          <article className="analytics-page__metric"><h2>Recipes created</h2><strong>{numberFormat.format(data.summary.recipes_created)}</strong><p>Matching recipes created in the displayed date range.</p></article>
          <article className="analytics-page__metric"><h2>Reviews</h2><strong>{numberFormat.format(data.summary.reviews)}</strong><p>Matching reviews in the displayed range across {numberFormat.format(data.summary.reviewed_recipes)} recipes.</p></article>
          <article className="analytics-page__metric"><h2>Average rating</h2><strong>{data.summary.average_rating === null ? '—' : data.summary.average_rating.toFixed(2)}</strong><p>{data.summary.average_rating === null ? 'No matching reviews in this date range.' : 'Out of 5, based on the matching reviews in this range.'}</p></article>
        </section>
        <div className="analytics-page__charts">
          <ActivityChart daily={data.daily} canFilter={matchesFilters} onDate={date => applyFilters({ ...filters, start: date, end: date })} />
          <RatingChart data={data} canFilter={matchesFilters} onRating={rating => applyFilters({ ...filters, rating: String(data.filters.rating === rating ? '' : rating) })} />
          <TopRecipes recipes={data.top_recipes} />
        </div>
        <p className="analytics-page__note">Exports contain this displayed snapshot, its filters and UTC generation time. The ratings distribution always contains all grades; other review metrics follow the star filter.</p>
      </>}
    </div>
  )
}

export default AnalyticsPage
