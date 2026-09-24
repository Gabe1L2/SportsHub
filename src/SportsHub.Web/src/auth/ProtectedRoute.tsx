import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'

export function ProtectedRoute({ admin = false }: { admin?: boolean }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="p-8 text-slate-300">Loading your account…</div>
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  if (admin && !user.roles.includes('Admin')) return <Navigate to="/" replace />
  return <Outlet />
}
