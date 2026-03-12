function MetricCard({ label, value, subtitle, progress }) {
  const hasProgress = typeof progress === 'number'
  const progressWidth = Math.max(0, Math.min(100, progress ?? 0))

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 shadow-lg">
      <p className="text-xs uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-100">{value}</p>
      {subtitle ? <p className="mt-1 text-sm text-slate-300">{subtitle}</p> : null}
      {hasProgress ? (
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-[#00C896] transition-all"
            style={{ width: `${progressWidth}%` }}
          />
        </div>
      ) : null}
    </div>
  )
}

export default MetricCard

