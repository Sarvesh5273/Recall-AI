import MetricCard from '../components/MetricCard'
import useAnalyticsPolling from '../hooks/useAnalyticsPolling'

function toPercent(value) {
  return `${(Number(value ?? 0) * 100).toFixed(1)}%`
}

function Dashboard() {
  const { analytics, loading } = useAnalyticsPolling()

  if (loading || !analytics) {
    return <p className="text-slate-300">Loading dashboard...</p>
  }

  const dau = Math.round(Number(analytics.active_shops ?? 0) * 0.78)
  const mau = Number(analytics.active_shops ?? 0)
  const azureBurn = Number(analytics.total_items ?? 0) * 0.0008

  return (
    <section>
      <h2 className="mb-4 text-2xl font-semibold text-[#00C896]">Dashboard</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="DAU" value={dau.toLocaleString()} subtitle="Daily active stores estimate" />
        <MetricCard label="MAU" value={mau.toLocaleString()} subtitle="Monthly active stores" />
        <MetricCard label="Total Scans" value={Number(analytics.total_scans ?? 0).toLocaleString()} subtitle="Across all stores" />
        <MetricCard label="Tier 1 Hit Rate" value={toPercent(analytics.tier1_hit_rate)} subtitle="Model routing efficiency" />
        <MetricCard label="Quarantine Rate" value={toPercent(analytics.quarantine_rate)} subtitle="Items moved to review" />
        <MetricCard label="Avg Items / Scan" value={Number(analytics.avg_items_per_scan ?? 0).toFixed(2)} subtitle="Scan density" />
        <MetricCard label="Total Items" value={Number(analytics.total_items ?? 0).toLocaleString()} subtitle="Items processed" />
        <MetricCard label="Azure Burn Estimate" value={`$${azureBurn.toFixed(2)}`} subtitle="Estimated run cost" />
      </div>
    </section>
  )
}

export default Dashboard

