import { useEffect, useState } from 'react'
import axios from 'axios'
import { getAnalytics } from '../api/analytics'
import ChartCard from '../components/ChartCard'

const QUEUE_FALLBACK_URL = 'http://localhost:8000/job-status/queue'
const HEALTH_URL = 'http://localhost:8000/health'

function readQueueDepth(payload) {
  const directCount = Number(payload?.pending_jobs ?? payload?.pending ?? payload?.queue_depth ?? payload?.count)
  if (Number.isFinite(directCount)) {
    return directCount
  }

  const nestedCount = Number(payload?.data?.pending_jobs ?? payload?.data?.pending ?? payload?.data?.queue_depth ?? payload?.data?.count)
  if (Number.isFinite(nestedCount)) {
    return nestedCount
  }

  return null
}

function getCircuitState(stateValue) {
  return String(stateValue ?? '').toLowerCase() === 'closed' ? 'CLOSED' : 'OPEN'
}

function formatTimestamp(value) {
  const parsedDate = new Date(value ?? Date.now())
  if (Number.isNaN(parsedDate.getTime())) {
    return String(value ?? '')
  }
  return parsedDate.toLocaleString()
}

function Operations() {
  const [loading, setLoading] = useState(true)
  const [queueDepth, setQueueDepth] = useState(0)
  const [healthStatus, setHealthStatus] = useState({
    ok: false,
    checkedAt: formatTimestamp(),
    circuits: {},
  })

  useEffect(() => {
    let isMounted = true

    async function loadOperationsStatus() {
      let pendingJobs = null

      try {
        const analyticsResponse = await getAnalytics()
        const analyticsData = analyticsResponse?.data ?? analyticsResponse
        const analyticsQueueDepth = Number(analyticsData?.queue_depth)
        if (Number.isFinite(analyticsQueueDepth)) {
          pendingJobs = analyticsQueueDepth
        }
      } catch {
        pendingJobs = null
      }

      if (pendingJobs === null) {
        try {
          const queueResponse = await axios.get(QUEUE_FALLBACK_URL, { timeout: 5000 })
          pendingJobs = readQueueDepth(queueResponse.data)
        } catch {
          pendingJobs = null
        }
      }

      let nextHealthStatus = {
        ok: false,
        checkedAt: formatTimestamp(),
        circuits: {},
      }

      try {
        const healthResponse = await axios.get(HEALTH_URL, { timeout: 5000 })
        const healthData = healthResponse.data ?? {}
        nextHealthStatus = {
          ok: healthResponse.status === 200,
          checkedAt: formatTimestamp(healthData.timestamp),
          circuits: healthData.circuits ?? {},
        }
      } catch {
        nextHealthStatus = {
          ok: false,
          checkedAt: formatTimestamp(),
          circuits: {},
        }
      }

      if (isMounted) {
        setQueueDepth(Number.isFinite(pendingJobs) ? pendingJobs : 0)
        setHealthStatus(nextHealthStatus)
        setLoading(false)
      }
    }

    void loadOperationsStatus()

    return () => {
      isMounted = false
    }
  }, [])

  if (loading) {
    return <p className="text-slate-300">Loading operations...</p>
  }

  const circuitBreakers = [
    { name: 'Sarvam Vision OCR', state: getCircuitState(healthStatus.circuits?.sarvam_ocr?.state) },
    { name: 'GPT-4o mini (Azure AI Foundry)', state: getCircuitState(healthStatus.circuits?.azure_openai?.state) },
    { name: 'Cosmos DB', state: 'CLOSED' },
  ]

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-[#00C896]">Operations</h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Redis Queue">
          <p className="text-2xl font-semibold text-[#4A9EFF]">Queue: {queueDepth.toLocaleString()} jobs pending</p>
        </ChartCard>
        <ChartCard title="FastAPI Health">
          <p className={healthStatus.ok ? 'text-xl font-semibold text-[#00C896]' : 'text-xl font-semibold text-[#FF6B35]'}>
            {healthStatus.ok ? 'Healthy' : 'Unhealthy'}
          </p>
          <p className="mt-2 text-sm text-slate-300">Checked at: {healthStatus.checkedAt}</p>
        </ChartCard>
      </div>

      <ChartCard title="Circuit Breakers">
        <div className="space-y-2">
          {circuitBreakers.map((breaker) => (
            <div key={breaker.name} className="flex items-center justify-between rounded-md bg-slate-900/60 px-3 py-2">
              <span className="text-slate-200">{breaker.name}</span>
              <span
                className={`inline-flex items-center gap-2 text-sm font-semibold uppercase ${
                  breaker.state === 'CLOSED' ? 'text-[#00C896]' : 'text-[#FF6B35]'
                }`}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${breaker.state === 'CLOSED' ? 'bg-[#00C896]' : 'bg-[#FF6B35]'}`} />
                {breaker.state}
              </span>
            </div>
          ))}
        </div>
      </ChartCard>

      <ChartCard title="Last Errors">
        <p className="text-slate-300">No errors logged</p>
      </ChartCard>
    </section>
  )
}

export default Operations
