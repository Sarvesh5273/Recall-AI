import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8000',
  timeout: 5000,
})

const ADMIN_HEADERS = {
  'X-Admin-Key': 'recallai-admin-2026',
}

const ADMIN_REQUEST_CONFIG = {
  headers: ADMIN_HEADERS,
}

const MOCK_ANALYTICS = {
  active_shops: 14,
  total_scans: 48210,
  total_items: 129443,
  tier1_hit_rate: 0.842,
  avg_items_per_scan: 2.68,
  quarantine_rate: 0.071,
  total_signals: 640,
}

export async function getAnalytics() {
  try {
    const response = await api.get('/admin/analytics', ADMIN_REQUEST_CONFIG)
    return response.data
  } catch {
    return MOCK_ANALYTICS
  }
}

export async function fetchStores() {
  try {
    const response = await api.get('/admin/stores', ADMIN_REQUEST_CONFIG)
    return Array.isArray(response.data) ? response.data : []
  } catch {
    return []
  }
}

export async function fetchQuarantineItems() {
  try {
    const response = await api.get('/admin/quarantine-items', ADMIN_REQUEST_CONFIG)
    return Array.isArray(response.data) ? response.data : []
  } catch {
    return []
  }
}
