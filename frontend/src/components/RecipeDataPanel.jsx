import { useEffect, useRef, useState } from 'react'
import Button from './Button'
import FieldError from './FieldError'
import {
  checkRecipeTransferFile,
  clearPendingRecipeImport,
  getRecipeImportResult,
  getRecipeTransferData,
  getRecipeTransferDownload,
  importRecipeTransferFile,
  readPendingRecipeImport,
  storePendingRecipeImport,
} from '../data/recipeTransfer'
import '../styles/recipe-data.css'

function countLabel(count) {
  return `${count} recipe${count === 1 ? '' : 's'}`
}

function fieldName(value) {
  return value.replaceAll('_', ' ')
}

function validationMessages(value, path = []) {
  if (typeof value === 'string') return [path.length ? `${path.map(fieldName).join(' ')}: ${value}` : value]
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => validationMessages(item,
      item && typeof item === 'object' ? [...path, String(index + 1)] : path))
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([field, item]) => validationMessages(item, [...path, field]))
  }
  return []
}

function RecipeDataPanel({ userId }) {
  const [data, setData] = useState(null)
  const [selected, setSelected] = useState([])
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [pending, setPending] = useState(null)
  const [storageAvailable, setStorageAvailable] = useState(true)
  const [recoveryError, setRecoveryError] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [rows, setRows] = useState([])
  const [isBusy, setIsBusy] = useState(false)
  const mounted = useRef(false)
  const busy = useRef(false)
  const loaded = useRef(false)
  const pendingImport = useRef(null)
  const controller = useRef(null)
  const fileInput = useRef(null)
  const downloadUrls = useRef(new Set())

  useEffect(() => {
    mounted.current = true
    try {
      const saved = readPendingRecipeImport(userId)
      pendingImport.current = saved.pending
      setPending(saved.pending)
      setStorageAvailable(saved.storageAvailable)
    } catch (failure) {
      setRecoveryError(failure.message)
    }
    return () => {
      mounted.current = false
      controller.current?.abort()
      for (const url of downloadUrls.current) URL.revokeObjectURL(url)
      downloadUrls.current.clear()
    }
  }, [userId])

  function begin(label) {
    if (busy.current) return false
    busy.current = true
    setIsBusy(true)
    setError('')
    setRows([])
    setMessage(label)
    return true
  }

  function finish() {
    busy.current = false
    if (mounted.current) setIsBusy(false)
  }

  function applyData(value) {
    const available = new Set(value.recipes.map(recipe => recipe.id))
    const firstLoad = !loaded.current
    setData(value)
    setSelected(previous => firstLoad
      ? value.recipes.slice(0, value.limits.max_recipes).map(recipe => recipe.id)
      : previous.filter(id => available.has(id)).slice(0, value.limits.max_recipes))
    loaded.current = true
  }

  function showFailure(failure, fallback) {
    if (!mounted.current || failure.name === 'AbortError') return
    setError(failure.message || fallback)
    setRows(Array.isArray(failure.rows) ? failure.rows : [])
    setMessage('')
  }

  async function reloadRecipes() {
    if (!begin('Loading your recipes…')) return
    const request = new AbortController()
    controller.current = request
    try {
      const value = await getRecipeTransferData(userId, request.signal)
      if (!mounted.current) return
      applyData(value)
      setMessage('')
    } catch (failure) {
      showFailure(failure, 'Your recipe list could not be loaded.')
    } finally {
      if (controller.current === request) controller.current = null
      finish()
    }
  }

  function changeSelection(id, checked) {
    if (busy.current || !data) return
    setSelected(previous => checked
      ? previous.length < data.limits.max_recipes && !previous.includes(id) ? [...previous, id] : previous
      : previous.filter(value => value !== id))
  }

  async function download(format) {
    if (!selected.length || !begin(`Preparing your ${format.toUpperCase()} download…`)) return
    const request = new AbortController()
    controller.current = request
    try {
      const result = await getRecipeTransferDownload(selected, format, request.signal)
      if (!mounted.current) return
      const url = URL.createObjectURL(result.blob)
      downloadUrls.current.add(url)
      const link = document.createElement('a')
      link.href = url
      link.download = result.filename
      link.hidden = true
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => {
        URL.revokeObjectURL(url)
        downloadUrls.current.delete(url)
      }, 1000)
      setMessage(`${result.filename} is ready in your browser’s downloads.`)
    } catch (failure) {
      showFailure(failure, 'Your recipe download could not be prepared.')
    } finally {
      if (controller.current === request) controller.current = null
      finish()
    }
  }

  function changeFile(event) {
    if (busy.current) return
    setFile(event.target.files?.[0] || null)
    setPreview(null)
    setRows([])
    setError('')
    setMessage('')
  }

  async function checkFile(event) {
    event.preventDefault()
    if (!file || !data || busy.current) return
    if (!/\.(json|csv)$/i.test(file.name) || !file.size || file.size > data.limits.max_file_bytes) {
      setError(`Choose a nonempty JSON or CSV file no larger than ${Math.floor(data.limits.max_file_bytes / 1024 / 1024)} MiB.`)
      setPreview(null)
      return
    }
    if (!begin('Checking your recipe file…')) return
    const request = new AbortController()
    controller.current = request
    try {
      const checked = await checkRecipeTransferFile(userId, file, request.signal)
      if (!mounted.current) return
      const saved = pendingImport.current
      if (saved && checked.sha256 !== saved.sha256) {
        setPreview(null)
        setError('An earlier import still needs its result checked. Choose the same file used for that import to retry it.')
        setMessage('')
        return
      }
      setPreview(checked)
      setMessage(`${countLabel(checked.recipe_count)} checked. Review the recipe names before importing.`)
    } catch (failure) {
      if (mounted.current) setPreview(null)
      showFailure(failure, 'This recipe file could not be checked.')
    } finally {
      if (controller.current === request) controller.current = null
      finish()
    }
  }

  async function acceptReceipt(receipt) {
    const saved = pendingImport.current
    if (saved && saved.request_id === receipt.request_id) {
      const cleared = clearPendingRecipeImport(userId, receipt.request_id)
      pendingImport.current = null
      if (mounted.current) {
        setPending(null)
        if (!cleared) setStorageAvailable(false)
      }
    }
    if (!mounted.current) return
    setPreview(null)
    setFile(null)
    if (fileInput.current) fileInput.current.value = ''
    const success = `${countLabel(receipt.recipe_count)} imported as new copies. They are pending approval.`
    setMessage(success)
    const request = new AbortController()
    controller.current = request
    try {
      const value = await getRecipeTransferData(userId, request.signal)
      if (mounted.current) applyData(value)
    } catch {
      if (mounted.current) setMessage(`${success} Refresh the download list to see the new copies.`)
    } finally {
      if (controller.current === request) controller.current = null
    }
  }

  async function importFile() {
    if (!file || !preview || recoveryError || busy.current) return
    if (pendingImport.current && pendingImport.current.sha256 !== preview.sha256) return
    if (!begin(pendingImport.current ? 'Checking and retrying the same import…' : 'Importing your recipes…')) return
    let attempt = pendingImport.current
    try {
      if (!attempt) {
        attempt = { request_id: window.crypto.randomUUID(), sha256: preview.sha256 }
        const stored = storePendingRecipeImport(userId, attempt)
        pendingImport.current = attempt
        setPending(attempt)
        setStorageAvailable(stored)
      }
      const receipt = await importRecipeTransferFile(userId, file, attempt.sha256, attempt.request_id)
      await acceptReceipt(receipt)
    } catch (failure) {
      if (failure.status === 400 && attempt) {
        clearPendingRecipeImport(userId, attempt.request_id)
        pendingImport.current = null
        if (mounted.current) {
          setPending(null)
          setPreview(null)
        }
      }
      showFailure(failure, 'The import result could not be confirmed. Check its result before importing again.')
    } finally {
      finish()
    }
  }

  async function checkImportResult() {
    const attempt = pendingImport.current
    if (!attempt || !begin('Checking your import result…')) return
    const request = new AbortController()
    controller.current = request
    try {
      const receipt = await getRecipeImportResult(userId, attempt.request_id, attempt.sha256, request.signal)
      await acceptReceipt(receipt)
    } catch (failure) {
      if (mounted.current && failure.status === 404) {
        setMessage('No completed result is available yet. The import may still be running. Check again, or choose the same file and retry this import.')
      } else showFailure(failure, 'Your import result could not be checked.')
    } finally {
      if (controller.current === request) controller.current = null
      finish()
    }
  }

  const maxSelected = data?.limits.max_recipes || 25
  const importReady = Boolean(preview && file && !recoveryError
    && (!pending || pending.sha256 === preview.sha256))

  return (
    <details
      className="detail-panel detail-panel--profile-section recipe-data"
      onToggle={event => {
        if (event.currentTarget.open && !loaded.current && !busy.current) void reloadRecipes()
      }}
    >
      <summary className="recipe-data__summary">
        <h2 className="profile-page__section-title">Recipe data</h2>
      </summary>
      <div className="recipe-data__body" aria-busy={isBusy}>
        <p className="profile-page__section-note">
          Download your recipes to your computer, or upload a recipe file to add recipes to your account.
          JSON keeps fields and lists together; CSV stores recipes in spreadsheet rows. Both include recipe photos.
        </p>
        <FieldError message={recoveryError} />
        <div className="recipe-data__sections">
          <section className="recipe-data__section" aria-labelledby={`recipe-export-title-${userId}`}>
            <h3 id={`recipe-export-title-${userId}`}>Download recipes</h3>
            <p className="profile-page__section-note">Choose up to {maxSelected} of your recipes, then choose a file format.</p>
            <div className="recipe-data__actions">
              <Button variant="ghost" disabled={isBusy} onClick={() => void reloadRecipes()}>
                {data ? 'Refresh list' : 'Load recipes'}
              </Button>
              {data?.recipes.length ? (
                <>
                  <Button variant="ghost" disabled={isBusy} onClick={() => setSelected(data.recipes.slice(0, maxSelected).map(recipe => recipe.id))}>
                    {data.recipes.length <= maxSelected ? 'Select all' : `Select first ${maxSelected}`}
                  </Button>
                  <Button variant="ghost" disabled={isBusy || !selected.length} onClick={() => setSelected([])}>Clear selection</Button>
                </>
              ) : null}
            </div>
            {data?.recipes.length ? (
              <ul className="recipe-data__selection" aria-label="Your recipes to download">
                {data.recipes.map(recipe => (
                  <li key={recipe.id}>
                    <label className="recipe-data__choice">
                      <input
                        type="checkbox"
                        checked={selected.includes(recipe.id)}
                        disabled={isBusy || !selected.includes(recipe.id) && selected.length >= maxSelected}
                        onChange={event => changeSelection(recipe.id, event.target.checked)}
                      />
                      <span>{recipe.title}</span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : data ? <p className="profile-page__section-note">You have no recipes to download yet.</p> : null}
            <p className="profile-page__section-note">{selected.length} selected</p>
            <div className="recipe-data__actions">
              <Button disabled={isBusy || !selected.length} onClick={() => void download('json')}>Download JSON</Button>
              <Button variant="ghost" disabled={isBusy || !selected.length} onClick={() => void download('csv')}>Download CSV</Button>
            </div>
          </section>

          <section className="recipe-data__section" aria-labelledby={`recipe-import-title-${userId}`}>
            <h3 id={`recipe-import-title-${userId}`}>Import recipes</h3>
            <p className="profile-page__section-note">
              Choose a JSON or CSV recipe file downloaded here. Imported recipes become new copies in your account and await approval.
            </p>
            {pending ? (
              <div className="recipe-data__preview">
                <p className="profile-page__section-note">An import still needs its result confirmed. Check its result before starting a different import.</p>
                {!storageAvailable ? <p className="profile-page__section-note">Keep this page open until the import is confirmed. This browser cannot keep the recovery details after you leave.</p> : null}
                <div className="recipe-data__actions">
                  <Button variant="ghost" disabled={isBusy} onClick={() => void checkImportResult()}>Check import result</Button>
                </div>
              </div>
            ) : null}
            <form className="recipe-data__file-field" onSubmit={event => void checkFile(event)}>
              <label htmlFor={`recipe-data-file-${userId}`}>Recipe file</label>
              <input
                ref={fileInput}
                id={`recipe-data-file-${userId}`}
                type="file"
                accept=".json,.csv,application/json,text/csv"
                required
                disabled={isBusy || !data}
                onChange={changeFile}
                aria-describedby={`recipe-data-file-help-${userId}`}
              />
              <p id={`recipe-data-file-help-${userId}`} className="profile-page__section-note">
                Up to {maxSelected} recipes per file, maximum {Math.floor((data?.limits.max_file_bytes || 20 * 1024 * 1024) / 1024 / 1024)} MiB. Checking a file does not save recipes.
              </p>
              <div className="recipe-data__actions">
                <Button variant="ghost" type="submit" disabled={isBusy || !file || !data}>Check file</Button>
              </div>
            </form>
            {preview ? (
              <div className="recipe-data__preview">
                <p>{countLabel(preview.recipe_count)} ready to import:</p>
                <ul className="recipe-data__titles">
                  {preview.recipes.map(recipe => <li key={recipe.row}>{recipe.title}</li>)}
                </ul>
                <div className="recipe-data__actions">
                  <Button disabled={isBusy || !importReady} onClick={() => void importFile()}>
                    {pending ? 'Retry same import' : `Import ${countLabel(preview.recipe_count)}`}
                  </Button>
                </div>
              </div>
            ) : null}
          </section>
        </div>
        {message ? <p className="recipe-data__message" role="status">{message}</p> : null}
        <FieldError message={error} />
        {rows.length ? (
          <ul className="recipe-data__errors" aria-label="Recipe file errors">
            {rows.map((row, index) => (
              <li key={`${row.row ?? index}-${index}`}>
                <strong>Recipe {row.row ?? index + 1}{typeof row.title === 'string' && row.title ? ` — ${row.title}` : ''}</strong>
                <ul>
                  {validationMessages(row.errors).slice(0, 100).map((issue, issueIndex) => <li key={issueIndex}>{issue}</li>)}
                </ul>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </details>
  )
}

export default RecipeDataPanel
