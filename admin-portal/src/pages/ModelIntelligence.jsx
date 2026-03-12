import { useEffect, useState } from 'react'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fetchQuarantineItems } from '../api/analytics'
import ChartCard from '../components/ChartCard'
import MetricCard from '../components/MetricCard'
import useAnalyticsPolling from '../hooks/useAnalyticsPolling'

function normalizeRate(rateValue) {
  const numericRate = Number(rateValue ?? 0)
  if (Number.isNaN(numericRate)) {
    return 0
  }
  const percentageRate = numericRate <= 1 ? numericRate * 100 : numericRate
  return Math.max(0, Math.min(100, percentageRate))
}

function buildTrend(dailyHistory) {
  if (Array.isArray(dailyHistory) && dailyHistory.length > 0) {
    return dailyHistory.slice(0, 7).map((point, index) => {
      if (point && typeof point === 'object') {
        return {
          day: `D-${index}`,
          rate: normalizeRate(point.rate ?? point.hit_rate ?? point.tier1_hit_rate),
        }
      }
      return {
        day: `D-${index}`,
        rate: normalizeRate(point),
      }
    })
  }

  return Array.from({ length: 7 }, (_, index) => ({
    day: `D-${index}`,
    rate: 0,
  }))
}

function ModelIntelligence() {
  const { analytics, loading } = useAnalyticsPolling()
  const [quarantinedItems, setQuarantinedItems] = useState([])

  useEffect(() => {
    let isMounted = true

    async function loadQuarantinedItems() {
      const items = await fetchQuarantineItems()
      if (isMounted) {
        setQuarantinedItems(Array.isArray(items) ? items : [])
      }
    }

    void loadQuarantinedItems()

    return () => {
      isMounted = false
    }
  }, [])

  if (loading || !analytics) {
    return <p className="text-slate-300">Loading model intelligence...</p>
  }

  const analyticsData = analytics.data ?? analytics
  const scansForFineTuning = Number(analyticsData.total_scans_this_month ?? analyticsData.total_scans ?? 0)
  const scanProgress = Math.min(100, (scansForFineTuning / 1000) * 100)
  const trendData = buildTrend(
    analyticsData.tier1_hit_rate_daily_history ?? analyticsData.tier1_hit_rate_history ?? analyticsData.daily_tier1_hit_rate,
  )

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-[#00C896]">Model Intelligence</h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <MetricCard
          label="Training signals collected — labeled OCR pairs from owner resolutions"
          value={`${scansForFineTuning.toLocaleString()} / 1,000 scans`}
          subtitle={`${Math.min(scansForFineTuning, 1000).toLocaleString()} / 1,000 scans`}
          progress={scanProgress}
        />
        <div className="lg:col-span-2">
          <ChartCard title="Tier 1 Hit Rate Trend (7d)">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <XAxis dataKey="day" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" domain={[0, 100]} unit="%" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0A0F1E', border: '1px solid #334155', color: '#e2e8f0' }}
                    formatter={(value) => `${Number(value).toFixed(2)}%`}
                  />
                  <Line type="monotone" dataKey="rate" stroke="#4A9EFF" strokeWidth={3} dot={{ fill: '#00C896' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>
      </div>
      <ChartCard title="Top Quarantined Items">
        {quarantinedItems.length === 0 ? (
          <p className="text-slate-300">No quarantine items available.</p>
        ) : (
          <ul className="space-y-2">
            {quarantinedItems.map((item, index) => (
              <li key={`${item.raw_text ?? 'unknown'}-${index}`} className="flex items-center justify-between rounded-md bg-slate-900/60 px-3 py-2">
                <span className="text-slate-200">{item.raw_text ?? 'Unknown item'}</span>
                <span className="font-semibold text-[#FF6B35]">{Number(item.count ?? 0).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </ChartCard>
    </section>
  )
}

export default ModelIntelligence
