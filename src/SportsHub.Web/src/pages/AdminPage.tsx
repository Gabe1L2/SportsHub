import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

type AdminUser = { id: string; email: string; createdAtUtc: string }
export function AdminPage() {
  const client = useQueryClient(); const [email, setEmail] = useState(''); const [password, setPassword] = useState('')
  const users = useQuery({ queryKey: ['admin', 'users'], queryFn: () => api<AdminUser[]>('/api/admin/users') })
  const create = useMutation({ mutationFn: () => api<AdminUser>('/api/admin/users', { method: 'POST', body: JSON.stringify({ email, password }) }), onSuccess: () => { setEmail(''); setPassword(''); void client.invalidateQueries({ queryKey: ['admin', 'users'] }) } })
  function submit(event: FormEvent) { event.preventDefault(); create.mutate() }
  return <section><h1 className="text-4xl font-black">User management</h1><form onSubmit={submit} className="mt-7 grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 md:grid-cols-[1fr_1fr_auto]"><input className="rounded-xl border border-white/15 bg-black/20 px-4 py-3" type="email" placeholder="Email" required value={email} onChange={e => setEmail(e.target.value)} /><input className="rounded-xl border border-white/15 bg-black/20 px-4 py-3" type="password" minLength={12} placeholder="Temporary password" required value={password} onChange={e => setPassword(e.target.value)} /><button className="rounded-xl bg-emerald-400 px-5 py-3 font-bold text-ink">Create user</button>{create.error && <p className="text-sm text-rose-300 md:col-span-3">{create.error.message}</p>}</form><div className="mt-7 divide-y divide-white/10 rounded-2xl border border-white/10 bg-white/5">{users.data?.map(user => <div key={user.id} className="flex justify-between gap-4 p-4"><span>{user.email}</span><span className="text-sm text-slate-400">{new Date(user.createdAtUtc).toLocaleDateString()}</span></div>)}</div></section>
}
