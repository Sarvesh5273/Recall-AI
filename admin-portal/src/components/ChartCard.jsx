function ChartCard({ title, children }) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 shadow-lg">
      <h3 className="mb-4 text-lg font-semibold text-[#4A9EFF]">{title}</h3>
      {children}
    </section>
  )
}

export default ChartCard

