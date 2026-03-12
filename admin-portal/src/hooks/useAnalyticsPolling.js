import { useCallback, useEffect, useState } from 'react'
import { getAnalytics } from '../api/analytics'

export default function useAnalyticsPolling() {
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const data = await getAnalytics()
    setAnalytics(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    const initialFetch = setTimeout(() => {
      void refresh()
    }, 0)
    const timerId = setInterval(refresh, 30000)
    return () => {
      clearTimeout(initialFetch)
      clearInterval(timerId)
    }
  }, [refresh])

  return { analytics, loading }
}
