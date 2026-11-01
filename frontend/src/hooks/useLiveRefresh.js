import { useCallback, useEffect, useRef } from 'react'

const refreshInterval = 5000

export default function useLiveRefresh(refresh, { enabled = true, refreshKey, immediate = false } = {}) {
  const refreshCallback = useRef(refresh)
  const activeRequest = useRef(null)

  useEffect(() => {
    refreshCallback.current = refresh
  }, [refresh])

  const cancelRefresh = useCallback(() => {
    activeRequest.current?.abort()
  }, [])

  useEffect(() => {
    if (!enabled) return undefined
    let stopped = false
    let timer = null
    let request = null
    let refreshOnCompletion = false

    function schedule() {
      window.clearTimeout(timer)
      if (!stopped && document.visibilityState !== 'hidden') {
        timer = window.setTimeout(run, refreshInterval)
      }
    }

    async function run() {
      window.clearTimeout(timer)
      if (stopped || document.visibilityState === 'hidden') return
      if (request) {
        if (request.signal.aborted) refreshOnCompletion = true
        return
      }

      refreshOnCompletion = false
      const controller = new AbortController()
      request = controller
      activeRequest.current = controller
      try {
        await refreshCallback.current(controller.signal)
      } catch {
        // Pages report request failures; a failed refresh must not stop retries.
      } finally {
        request = null
        if (activeRequest.current === controller) activeRequest.current = null
        if (!stopped && refreshOnCompletion && document.visibilityState !== 'hidden') {
          refreshOnCompletion = false
          void run()
        } else {
          schedule()
        }
      }
    }

    function handleVisibility() {
      if (document.visibilityState === 'hidden') {
        window.clearTimeout(timer)
        request?.abort()
      } else {
        void run()
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleVisibility)
    if (immediate) void run()
    else schedule()

    return () => {
      stopped = true
      window.clearTimeout(timer)
      request?.abort()
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleVisibility)
    }
  }, [enabled, refreshKey, immediate])

  return cancelRefresh
}
