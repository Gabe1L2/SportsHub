import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

type Summary = { message: string; draftCount?: number; betCount?: number; pendingCount?: number }

function ModulePage({ kind }: { kind: 'fantasy' | 'betting' }) {
  const summary = useQuery({ queryKey: [kind, 'summary'], queryFn: () => api<Summary>(`/api/${kind}/summary`) })
  const fantasy = kind === 'fantasy'
  return <section><p className={`text-sm font-bold uppercase tracking-[.22em] ${fantasy ? 'text-violet-300' : 'text-emerald-300'}`}>{fantasy ? 'Fantasy' : 'Betting'}</p><h1 className="mt-3 text-4xl font-black">{fantasy ? 'Fantasy Draft Helper' : 'Sports Betting Tracker'}</h1><p className="mt-4 max-w-2xl text-slate-300">{summary.data?.message ?? 'Loading your workspace…'}</p><div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6"><div className="text-sm text-slate-400">{fantasy ? 'Drafts' : 'Tracked bets'}</div><div className="mt-2 text-4xl font-black">{fantasy ? (summary.data?.draftCount ?? '—') : (summary.data?.betCount ?? '—')}</div>{!fantasy && <div className="mt-2 text-sm text-slate-400">{summary.data?.pendingCount ?? '—'} pending</div>}<p className="mt-6 text-sm text-slate-400">Feature tools will be added here without creating another app or backend.</p></div></section>
}

export const FantasyPage = () => <ModulePage kind="fantasy" />
export const BettingPage = () => <ModulePage kind="betting" />
