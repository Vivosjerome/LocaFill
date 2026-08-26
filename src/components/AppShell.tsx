import { NavLink, Outlet } from 'react-router-dom'
import { FileStack, Home, ScanSearch, Settings, UserRound } from 'lucide-react'

const links = [
  { to: '/', label: 'Accueil', icon: Home, end: true },
  { to: '/profile', label: 'Profil', icon: UserRound },
  { to: '/documents', label: 'Documents', icon: FileStack },
  { to: '/analyzer', label: 'Analyser', icon: ScanSearch },
  { to: '/settings', label: 'Réglages', icon: Settings },
]

export function AppShell() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <span className="brand-mark" aria-hidden>
            ⌂
          </span>
          LocaFill
        </NavLink>
        <span className="privacy-chip">100 % local</span>
      </header>
      <main className="page">
        <Outlet />
      </main>
      <nav className="bottom-nav" aria-label="Navigation principale">
        {links.map((link) => (
          <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <link.icon size={18} strokeWidth={2.1} />
            {link.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
