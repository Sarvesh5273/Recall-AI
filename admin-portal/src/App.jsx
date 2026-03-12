import { useMemo, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import NavBar from './components/NavBar'
import Dashboard from './pages/Dashboard'
import Stores from './pages/Stores'
import ModelIntelligence from './pages/ModelIntelligence'
import Operations from './pages/Operations'

const AUTH_KEY = 'recallai_admin_auth'
const PASSWORD = 'recallai2026'

function AuthGate({ onAuthenticated }) {
  const [input, setInput] = useState('')
  const [error, setError] = useState('')

  const onSubmit = (event) => {
    event.preventDefault()
    if (input === PASSWORD) {
      localStorage.setItem(AUTH_KEY, 'true')
      onAuthenticated(true)
      return
    }
    setError('Invalid password')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0A0F1E] px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-950/60 p-6 shadow-xl">
        <h1 className="mb-2 text-xl font-semibold text-[#00C896]">Recall AI Admin</h1>
        <p className="mb-4 text-sm text-slate-300">Enter admin password to continue</p>
        <input
          type="password"
          value={input}
          onChange={(event) => {
            setInput(event.target.value)
            if (error) {
              setError('')
            }
          }}
          className="w-full rounded-md border border-slate-700 bg-[#0A0F1E] px-3 py-2 text-slate-100 outline-none ring-[#4A9EFF] focus:ring-2"
          placeholder="Password"
        />
        {error ? <p className="mt-2 text-sm text-[#FF6B35]">{error}</p> : null}
        <button
          type="submit"
          className="mt-4 w-full rounded-md bg-[#00C896] px-4 py-2 font-semibold text-[#0A0F1E] transition hover:brightness-110"
        >
          Unlock
        </button>
      </form>
    </div>
  )
}

function App() {
  const [authed, setAuthed] = useState(() => localStorage.getItem(AUTH_KEY) === 'true')

  const appShell = useMemo(
    () => (
      <BrowserRouter>
        <div className="min-h-screen bg-[#0A0F1E] text-slate-100">
          <NavBar />
          <main className="mx-auto max-w-7xl px-4 py-6 md:px-6">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/stores" element={<Stores />} />
              <Route path="/model-intelligence" element={<ModelIntelligence />} />
              <Route path="/operations" element={<Operations />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    ),
    [],
  )

  if (!authed) {
    return <AuthGate onAuthenticated={setAuthed} />
  }

  return appShell
}

export default App
