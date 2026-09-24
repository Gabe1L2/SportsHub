import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

type Summary = { message: string; draftCount: number }

export function FantasyPage() {
  const summary = useQuery({ queryKey: ['fantasy', 'summary'], queryFn: () => api<Summary>('/api/fantasy/summary') })
  return <section><p className="text-sm font-bold uppercase tracking-[.22em] text-violet-300">Fantasy</p><h1 className="mt-3 text-4xl font-black">Fantasy Draft Helper</h1><p className="mt-4 max-w-2xl text-slate-300">{summary.data?.message ?? 'Loading your workspace…'}</p><div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6"><div className="text-sm text-slate-400">Drafts</div><div className="mt-2 text-4xl font-black">{summary.data?.draftCount ?? '—'}</div><p className="mt-6 text-sm text-slate-400">Feature tools will be added here without creating another app or backend.</p></div></section>
}
