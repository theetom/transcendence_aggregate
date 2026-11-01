import { useCallback, useEffect, useState } from 'react'

export default function useTransientMessage(initialMessage = '', duration = 5000) {
  const [notice, setNotice] = useState(() => ({
    message: typeof initialMessage === 'function' ? initialMessage() : initialMessage,
  }))

  const setMessage = useCallback((value) => {
    setNotice((current) => ({
      message: typeof value === 'function' ? value(current.message) : value,
    }))
  }, [])

  useEffect(() => {
    if (!notice.message) return undefined
    const timer = window.setTimeout(() => {
      setNotice((current) => current === notice ? { message: '' } : current)
    }, duration)
    return () => window.clearTimeout(timer)
  }, [notice, duration])

  return [notice.message, setMessage]
}
