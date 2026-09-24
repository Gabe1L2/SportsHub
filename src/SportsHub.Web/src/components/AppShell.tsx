import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

const navClass = ({ isActive }: { isActive: boolean }) => `rounded-lg px-3 py-2 text-sm transition ${isActive ? 'bg-white/10 text-white' : 'text-slate-300 hover:text-white'}`

export function AppShell() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = () => setMenuOpen(false)
  return <div className="min-h-screen bg-[radial-gradient(circle_at_top,#14243c_0,#08111f_48%)]">
    {import.meta.env.DEV && <div className="bg-amber-400 px-4 py-2 text-center text-xs font-bold text-amber-950">Development UI — connected to shared production data</div>}
    <header className="border-b border-white/10 bg-ink/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4">
        <NavLink to="/" className="text-xl font-black tracking-tight" onClick={closeMenu}>SPORTS<span className="text-emerald-400">HUB</span></NavLink>
        <button type="button" className="grid size-10 place-items-center rounded-xl border border-white/15 text-xl text-slate-200 md:hidden" onClick={() => setMenuOpen(open => !open)} aria-label="Toggle navigation" aria-expanded={menuOpen}>{menuOpen ? '×' : '☰'}</button>
        <nav className="hidden items-center gap-1 md:flex">
          <NavLink className={navClass} to="/">Home</NavLink>
          <NavLink className={navClass} to="/fantasy">Fantasy</NavLink>
          <NavLink className={navClass} to="/betting">Betting</NavLink>
          {user ? <><NavLink className={navClass} to="/account">Account</NavLink>{user.roles.includes('Admin') && <NavLink className={navClass} to="/admin">Admin</NavLink>}<button className="ml-2 rounded-lg border border-white/15 px-3 py-2 text-sm" onClick={() => void logout()}>Log out</button></> : <NavLink className={navClass} to="/login">Log in</NavLink>}
        </nav>
      </div>
      {menuOpen && <nav key={location.pathname} className="grid grid-cols-2 gap-2 border-t border-white/10 px-5 py-4 md:hidden">
        <NavLink className={navClass} to="/" onClick={closeMenu}>Home</NavLink>
        <NavLink className={navClass} to="/fantasy" onClick={closeMenu}>Fantasy</NavLink>
        <NavLink className={navClass} to="/betting" onClick={closeMenu}>Betting</NavLink>
        {user ? <><NavLink className={navClass} to="/account" onClick={closeMenu}>Account</NavLink>{user.roles.includes('Admin') && <NavLink className={navClass} to="/admin" onClick={closeMenu}>Admin</NavLink>}<button className="rounded-lg border border-white/15 px-3 py-2 text-left text-sm text-slate-300" onClick={() => { closeMenu(); void logout() }}>Log out</button></> : <NavLink className={navClass} to="/login" onClick={closeMenu}>Log in</NavLink>}
      </nav>}
    </header>
    <main className="mx-auto max-w-6xl px-4 py-7 sm:px-5 sm:py-10"><Outlet /></main>
  </div>
}
