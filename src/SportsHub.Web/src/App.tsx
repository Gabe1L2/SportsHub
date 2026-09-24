import { Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { AppShell } from './components/AppShell'
import { AccountPage } from './pages/AccountPage'
import { AdminPage } from './pages/AdminPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { BettingPage } from './pages/BettingPage'
import { FantasyPage } from './pages/FantasyPage'

export default function App() {
  return <Routes><Route element={<AppShell />}><Route index element={<HomePage />} /><Route path="login" element={<LoginPage />} /><Route element={<ProtectedRoute />}><Route path="fantasy" element={<FantasyPage />} /><Route path="betting" element={<BettingPage />} /><Route path="account" element={<AccountPage />} /></Route><Route element={<ProtectedRoute admin />}><Route path="admin" element={<AdminPage />} /></Route><Route path="*" element={<div><h1 className="text-4xl font-black">Page not found</h1></div>} /></Route></Routes>
}
