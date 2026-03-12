import { NavLink } from 'react-router-dom'

const links = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/stores', label: 'Stores' },
  { to: '/model-intelligence', label: 'Model Intelligence' },
  { to: '/operations', label: 'Operations' },
]

function NavBar() {
  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
        <div>
          <p className="text-xl font-semibold text-[#00C896]">Recall AI Admin Portal</p>
          <p className="text-xs text-slate-400">localhost analytics control plane</p>
        </div>
        <nav className="flex flex-wrap gap-2">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  isActive
                    ? 'bg-[#4A9EFF] text-white'
                    : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  )
}

export default NavBar

