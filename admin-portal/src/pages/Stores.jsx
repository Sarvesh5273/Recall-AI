import { useEffect, useState } from 'react'
import { fetchStores } from '../api/analytics'

function formatScanDate(lastScanDate) {
  if (!lastScanDate) {
    return '—'
  }
  const parsedDate = new Date(lastScanDate)
  if (Number.isNaN(parsedDate.getTime())) {
    return String(lastScanDate)
  }
  return parsedDate.toLocaleString()
}

function Stores() {
  const [stores, setStores] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    async function loadStores() {
      const data = await fetchStores()
      if (isMounted) {
        setStores(Array.isArray(data) ? data : [])
        setLoading(false)
      }
    }

    void loadStores()

    return () => {
      isMounted = false
    }
  }, [])

  if (loading) {
    return <p className="text-slate-300">Loading stores...</p>
  }

  return (
    <section>
      <h2 className="mb-4 text-2xl font-semibold text-[#00C896]">Stores</h2>
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900/80 text-slate-300">
            <tr>
              <th className="px-4 py-3">Shop ID</th>
              <th className="px-4 py-3">Shop Name</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Locality</th>
              <th className="px-4 py-3">Pincode</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Scans This Month</th>
              <th className="px-4 py-3">Last Scan Date</th>
            </tr>
          </thead>
          <tbody>
            {stores.length === 0 ? (
              <tr className="border-t border-slate-800">
                <td className="px-4 py-6 text-center text-slate-400" colSpan={8}>
                  No stores found.
                </td>
              </tr>
            ) : (
              stores.map((store, index) => (
                <tr key={`${store.shop_id ?? store.shop_name ?? 'store'}-${index}`} className="border-t border-slate-800">
                  <td className="px-4 py-3 text-slate-200">{store.shop_id ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-200">{store.shop_name ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-300">{store.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-300">{store.locality ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-300">{store.pincode ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-300">{store.plan ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-200">{Number(store.scans_this_month ?? 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-slate-300">{formatScanDate(store.last_scan_date)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default Stores
