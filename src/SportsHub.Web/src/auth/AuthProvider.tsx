import { createContext, useContext, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type CurrentUser } from '../lib/api'

type AuthContextValue = {
  user: CurrentUser | null
  loading: boolean
  login: (email: string, password: string, rememberMe: boolean) => Promise<CurrentUser>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const me = useQuery({
    queryKey: ['account', 'me'],
    queryFn: () => api<CurrentUser>('/api/account/me'),
    retry: false,
    staleTime: 60_000,
  })
  const loginMutation = useMutation({
    mutationFn: (credentials: { email: string; password: string; rememberMe: boolean }) => api<CurrentUser>('/api/account/login', { method: 'POST', body: JSON.stringify(credentials) }),
    onSuccess: (user) => queryClient.setQueryData(['account', 'me'], user),
  })
  const logoutMutation = useMutation({
    mutationFn: () => api<void>('/api/account/logout', { method: 'POST' }),
    onSuccess: () => queryClient.setQueryData(['account', 'me'], null),
  })
  return <AuthContext.Provider value={{
    user: me.data ?? null,
    loading: me.isLoading,
    login: (email, password, rememberMe) => loginMutation.mutateAsync({ email, password, rememberMe }),
    logout: () => logoutMutation.mutateAsync(),
  }}>{children}</AuthContext.Provider>
}

// The provider and its tightly coupled hook intentionally share one module.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
