import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../auth/AuthProvider'
import { BetForm } from '../features/betting/BetForm'
import { LookupManager } from '../features/betting/LookupManager'
import { SettleDialog } from '../features/betting/SettleDialog'
import type { Bet, BetInput, BettingLookups, BetListResponse, BetStatus, BetTiming } from '../features/betting/types'
import { displayEnum, money, percent } from '../features/betting/types'
import { EmptyState, inputClass, primaryButton, secondaryButton } from '../features/betting/ui'

type Filters = { search: string; status: '' | BetStatus; timing: '' | BetTiming; platformId: string; sourceId: string; archived: boolean; sort: string; page: number }
type ViewMode = 'comfortable' | 'compact'
const initialFilters: Filters = { search: '', status: '', timing: '', platformId: '', sourceId: '', archived: false, sort: 'placedDesc', page: 1 }
const statuses: BetStatus[] = ['Pending', 'Won', 'Lost', 'PartiallyWon', 'Push', 'Voided']

const statusStyle: Record<BetStatus, string> = {
  Pending: 'bg-amber-400/10 text-amber-300', Won: 'bg-emerald-400/10 text-emerald-300', Lost: 'bg-rose-400/10 text-rose-300',
  PartiallyWon: 'bg-sky-400/10 text-sky-300', Push: 'bg-slate-400/10 text-slate-300', Voided: 'bg-slate-400/10 text-slate-400',
}

export function BettingPage() {
  const client = useQueryClient()
  const { user } = useAuth()
  const canManagePlatforms = user?.roles.includes('Admin') ?? false
  const [filters, setFilters] = useState(initialFilters)
  const [viewMode, setViewMode] = useState<ViewMode>(() => localStorage.getItem('betting-view-mode') === 'compact' ? 'compact' : 'comfortable')
  const [formBet, setFormBet] = useState<Bet | null | undefined>(undefined)
  const [settling, setSettling] = useState<Bet | null>(null)
  const [managing, setManaging] = useState(false)
  const [actionError, setActionError] = useState('')
  const pageSize = viewMode === 'compact' ? 100 : 20
  useEffect(() => { localStorage.setItem('betting-view-mode', viewMode) }, [viewMode])
  const queryString = useMemo(() => {
    const query = new URLSearchParams({ archived: String(filters.archived), sort: filters.sort, page: String(filters.page), pageSize: String(pageSize) })
    if (filters.search) query.set('search', filters.search)
    if (filters.status) query.set('status', filters.status)
    if (filters.timing) query.set('timing', filters.timing)
    if (filters.platformId) query.set('platformId', filters.platformId)
    if (filters.sourceId) query.set('sourceId', filters.sourceId)
    return query.toString()
  }, [filters, pageSize])
  const bets = useQuery({ queryKey: ['betting', 'bets', queryString], queryFn: () => api<BetListResponse>(`/api/betting/bets?${queryString}`) })
  const lookups = useQuery({ queryKey: ['betting', 'lookups'], queryFn: () => api<BettingLookups>('/api/betting/lookups') })
  const refresh = () => client.invalidateQueries({ queryKey: ['betting'] })
  const saveBet = useMutation({ mutationFn: ({ bet, input }: { bet?: Bet | null; input: BetInput }) => api<Bet>(bet ? `/api/betting/bets/${bet.id}` : '/api/betting/bets', { method: bet ? 'PUT' : 'POST', body: JSON.stringify(input) }), onSuccess: () => { setFormBet(undefined); void refresh() } })
  const settleBet = useMutation({ mutationFn: ({ bet, input }: { bet: Bet; input: unknown }) => api(`/api/betting/bets/${bet.id}/settle`, { method: 'POST', body: JSON.stringify(input) }), onSuccess: () => { setSettling(null); void refresh() } })
  const archiveBet = useMutation({ mutationFn: ({ bet, restore }: { bet: Bet; restore: boolean }) => api<void>(`/api/betting/bets/${bet.id}/${restore ? 'restore' : 'archive'}`, { method: 'POST' }), onSuccess: () => void refresh() })

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) { setFilters(current => ({ ...current, [key]: value, page: key === 'page' ? value as number : 1 })) }
  async function archive(bet: Bet) {
    setActionError('')
    if (!bet.isArchived && !window.confirm('Archive this bet? It will leave the active list but remain in your history.')) return
    try { await archiveBet.mutateAsync({ bet, restore: bet.isArchived }) } catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Unable to update the bet.') }
  }
  function addBet() {
    if (lookups.data?.platforms.some(x => x.isActive)) { setFormBet(null); return }
    if (canManagePlatforms) setManaging(true)
    else setActionError('An administrator must add an active betting platform before you can enter a bet.')
  }

  const summary = bets.data?.summary
  const totalPages = Math.max(1, Math.ceil((bets.data?.totalCount ?? 0) / pageSize))
  const filtered = filters.search || filters.status || filters.timing || filters.platformId || filters.sourceId
  return <section>
    <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <div><p className="text-sm font-bold uppercase tracking-[.22em] text-emerald-300">Sports betting</p><h1 className="mt-2 text-4xl font-black tracking-tight md:text-5xl">Bet tracker</h1><p className="mt-3 max-w-2xl text-slate-400">Capture the offer, settle the result, and understand the numbers behind every entry.</p></div>
      <div className="flex flex-wrap gap-2"><div className="flex rounded-xl border border-white/15 bg-white/5 p-1" aria-label="Bet list view"><button className={`rounded-lg px-3 py-2 text-sm font-semibold ${viewMode === 'comfortable' ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-white'}`} onClick={() => { setViewMode('comfortable'); setFilter('page', 1) }}>Comfortable</button><button className={`rounded-lg px-3 py-2 text-sm font-semibold ${viewMode === 'compact' ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-white'}`} onClick={() => { setViewMode('compact'); setFilter('page', 1) }}>Compact</button></div><button className={secondaryButton} onClick={() => setManaging(true)}>{canManagePlatforms ? 'Manage platforms & sources' : 'Manage sources'}</button><button className={primaryButton} onClick={addBet}>+ Add bet</button></div>
    </div>

    <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard label="Tracked bets" value={summary?.totalBets.toLocaleString() ?? '—'} detail={`${summary?.pendingBets ?? 0} pending`} />
      <SummaryCard label="Cash entered" value={summary ? money(summary.totalEntryCost) : '—'} detail="Active history" />
      <SummaryCard label="Net profit" value={summary ? money(summary.netProfit) : '—'} detail="Settled bets" tone={(summary?.netProfit ?? 0) >= 0 ? 'positive' : 'negative'} />
      <SummaryCard label="ROI" value={summary ? percent(summary.roi) : '—'} detail="On settled cash cost" tone={(summary?.roi ?? 0) >= 0 ? 'positive' : 'negative'} />
    </div>

    <div className="mt-8 rounded-2xl border border-white/10 bg-white/[.035] p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.5fr_repeat(5,1fr)]">
        <input className={inputClass.replace('mt-1.5 ', '')} placeholder="Search platform, source, or notes" value={filters.search} onChange={e => setFilter('search', e.target.value)} />
        <select className={inputClass.replace('mt-1.5 ', '')} value={filters.status} onChange={e => setFilter('status', e.target.value as Filters['status'])}><option value="">All results</option>{statuses.map(x => <option key={x} value={x}>{displayEnum(x)}</option>)}</select>
        <select className={inputClass.replace('mt-1.5 ', '')} value={filters.platformId} onChange={e => setFilter('platformId', e.target.value)}><option value="">All platforms</option>{lookups.data?.platforms.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <select className={inputClass.replace('mt-1.5 ', '')} value={filters.sourceId} onChange={e => setFilter('sourceId', e.target.value)}><option value="">All sources</option>{lookups.data?.sources.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <select className={inputClass.replace('mt-1.5 ', '')} value={filters.timing} onChange={e => setFilter('timing', e.target.value as Filters['timing'])}><option value="">Pregame + live</option><option value="Pregame">Pregame</option><option value="Live">Live</option></select>
        <select className={inputClass.replace('mt-1.5 ', '')} value={filters.sort} onChange={e => setFilter('sort', e.target.value)}><option value="placedDesc">Newest first</option><option value="placedAsc">Oldest first</option><option value="entryDesc">Highest entry</option><option value="entryAsc">Lowest entry</option><option value="status">Result</option></select>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><label className="flex cursor-pointer items-center gap-2 text-sm text-slate-400"><input type="checkbox" className="accent-emerald-400" checked={filters.archived} onChange={e => setFilter('archived', e.target.checked)} />Show archived bets</label>{filtered && <button className="text-xs font-semibold text-emerald-300 hover:text-emerald-200" onClick={() => setFilters(current => ({ ...initialFilters, archived: current.archived }))}>Clear filters</button>}</div>
    </div>

    {actionError && <p className="mt-4 rounded-xl bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{actionError}</p>}
    <div className="mt-5">
      {bets.isLoading ? <div className="space-y-3">{[1, 2, 3].map(x => <div key={x} className="h-24 animate-pulse rounded-2xl bg-white/5" />)}</div>
        : bets.error ? <EmptyState title="Could not load bets" detail={bets.error.message} />
        : bets.data?.items.length === 0 ? <EmptyState title={filters.archived ? 'No archived bets' : filtered ? 'No bets match these filters' : 'Add your first bet'} detail={filters.archived ? 'Archived bets will appear here.' : filtered ? 'Try clearing one or more filters.' : 'Start with the exact entry and payout offered by the platform.'} action={!filters.archived && !filtered ? <button className={primaryButton} onClick={addBet}>+ Add bet</button> : undefined} />
        : viewMode === 'compact' ? <CompactBetTable bets={bets.data?.items ?? []} onEdit={setFormBet} onSettle={setSettling} onArchive={bet => void archive(bet)} busy={archiveBet.isPending} />
        : <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[.025]">
          <div className="hidden grid-cols-[1.35fr_.75fr_.7fr_.75fr_.75fr_1fr] gap-3 border-b border-white/10 px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 lg:grid"><span>Bet</span><span>Entry</span><span>Odds</span><span>Expected</span><span>Result</span><span className="text-right">Actions</span></div>
          <div className="divide-y divide-white/10">{bets.data?.items.map(bet => <BetRow key={bet.id} bet={bet} onEdit={() => setFormBet(bet)} onSettle={() => setSettling(bet)} onArchive={() => void archive(bet)} busy={archiveBet.isPending} />)}</div>
        </div>}
    </div>

    {(bets.data?.totalCount ?? 0) > pageSize && <div className="mt-5 flex items-center justify-between text-sm text-slate-400"><span>Page {filters.page} of {totalPages}</span><div className="flex gap-2"><button className={secondaryButton} disabled={filters.page <= 1} onClick={() => setFilter('page', filters.page - 1)}>Previous</button><button className={secondaryButton} disabled={filters.page >= totalPages} onClick={() => setFilter('page', filters.page + 1)}>Next</button></div></div>}

    {formBet !== undefined && lookups.data && <BetForm bet={formBet} lookups={lookups.data} saving={saveBet.isPending} onClose={() => setFormBet(undefined)} onSave={input => saveBet.mutateAsync({ bet: formBet, input }).then(() => undefined)} />}
    {settling && <SettleDialog bet={settling} saving={settleBet.isPending} onClose={() => setSettling(null)} onSave={input => settleBet.mutateAsync({ bet: settling, input }).then(() => undefined)} />}
    {managing && lookups.data && <LookupManager lookups={lookups.data} canManagePlatforms={canManagePlatforms} onClose={() => setManaging(false)} />}
  </section>
}

function SummaryCard({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: 'positive' | 'negative' }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[.04] p-5"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p><p className={`mt-2 text-2xl font-black ${tone === 'positive' ? 'text-emerald-300' : tone === 'negative' ? 'text-rose-300' : 'text-white'}`}>{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>
}

function BetRow({ bet, onEdit, onSettle, onArchive, busy }: { bet: Bet; onEdit: () => void; onSettle: () => void; onArchive: () => void; busy: boolean }) {
  return <article className="grid gap-4 px-5 py-4 transition hover:bg-white/[.025] lg:grid-cols-[1.35fr_.75fr_.7fr_.75fr_.75fr_1fr] lg:items-center">
    <div><div className="flex flex-wrap items-center gap-2"><strong>{bet.platform.name}</strong><span className="rounded-md bg-white/5 px-2 py-1 text-[10px] font-bold uppercase text-slate-400">{bet.timing}</span>{bet.bonus && <span className="rounded-md bg-violet-400/10 px-2 py-1 text-[10px] font-bold uppercase text-violet-300">{displayEnum(bet.bonus.type)}</span>}</div><p className="mt-1 text-xs text-slate-500">{bet.legCount} {bet.legCount === 1 ? 'leg' : 'legs'} · {bet.payoutMode === 'Flex' ? 'Flex' : 'All or nothing'}{bet.source ? ` · ${bet.source.name}` : ''} · {new Date(bet.placedAtUtc).toLocaleString()}</p>{bet.notes && <p className="mt-2 line-clamp-1 text-xs text-slate-400">{bet.notes}</p>}</div>
    <Data label="Entry" value={money(bet.entryCost, bet.currencyCode)} sub={bet.entryCost !== bet.entryValue ? `${money(bet.entryValue, bet.currencyCode)} value` : undefined} />
    <Data label="Odds" value={bet.decimalOdds?.toFixed(3) ?? '—'} sub={bet.estimatedProbability == null ? undefined : `${percent(bet.estimatedProbability)} est.`} />
    <Data label="Expected" value={money(bet.expectedPayout, bet.currencyCode)} />
    <div><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusStyle[bet.status]}`}>{displayEnum(bet.status)}</span>{bet.profitLoss != null && <p className={`mt-1 text-xs font-semibold ${bet.profitLoss >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{bet.profitLoss >= 0 ? '+' : ''}{money(bet.profitLoss, bet.currencyCode)}</p>}</div>
    <div className="flex flex-wrap justify-start gap-2 lg:justify-end">{!bet.isArchived && <><button className="text-xs font-semibold text-slate-300 hover:text-white" onClick={onEdit}>Edit</button><button className="text-xs font-semibold text-emerald-300 hover:text-emerald-200" onClick={onSettle}>{bet.status === 'Pending' ? 'Settle' : 'Update result'}</button></>}<button disabled={busy} className="text-xs font-semibold text-slate-500 hover:text-slate-300" onClick={onArchive}>{bet.isArchived ? 'Restore' : 'Archive'}</button></div>
  </article>
}

function CompactBetTable({ bets, onEdit, onSettle, onArchive, busy }: { bets: Bet[]; onEdit: (bet: Bet) => void; onSettle: (bet: Bet) => void; onArchive: (bet: Bet) => void; busy: boolean }) {
  const columns = 'grid-cols-[155px_170px_48px_90px_85px_95px_105px_90px_75px_minmax(180px,1fr)_120px_145px]'
  return <div className="relative left-1/2 w-[calc(100vw-2rem)] max-w-[1800px] -translate-x-1/2">
    <div className="max-h-[68vh] overflow-auto rounded-xl border border-white/10 bg-[#0b1626] shadow-xl shadow-black/10">
      <div className={`sticky top-0 z-10 grid min-w-[1380px] ${columns} items-center gap-2 border-b border-white/15 bg-[#111d2e] px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-400`}><span>Date & time</span><span>Platform</span><span>Legs</span><span>Structure</span><span>Entry</span><span>Payout</span><span>Result</span><span>P&amp;L</span><span>Timing</span><span>Notes</span><span>Source</span><span className="text-right">Actions</span></div>
      <div className="min-w-[1380px] divide-y divide-white/[.06]">{bets.map((bet, index) => <CompactBetRow key={bet.id} bet={bet} columns={columns} alternate={index % 2 === 1} onEdit={() => onEdit(bet)} onSettle={() => onSettle(bet)} onArchive={() => onArchive(bet)} busy={busy} />)}</div>
    </div>
  </div>
}

function CompactBetRow({ bet, columns, alternate, onEdit, onSettle, onArchive, busy }: { bet: Bet; columns: string; alternate: boolean; onEdit: () => void; onSettle: () => void; onArchive: () => void; busy: boolean }) {
  const placed = new Date(bet.placedAtUtc).toLocaleString(undefined, { month: 'numeric', day: 'numeric', year: '2-digit', hour: 'numeric', minute: '2-digit' })
  return <div className={`grid ${columns} items-center gap-2 px-3 py-1.5 text-xs transition hover:bg-emerald-400/[.055] ${alternate ? 'bg-white/[.018]' : ''}`}>
    <span className="whitespace-nowrap tabular-nums text-slate-400">{placed}</span>
    <span className="flex min-w-0 items-center gap-1.5"><strong className="truncate text-slate-100" title={bet.platform.name}>{bet.platform.name}</strong>{bet.bonus && <span className="shrink-0 rounded bg-violet-400/10 px-1.5 py-0.5 text-[9px] font-bold text-violet-300" title={displayEnum(bet.bonus.type)}>B</span>}</span>
    <span className="tabular-nums text-slate-300">{bet.legCount}</span>
    <span className="truncate text-slate-400">{bet.payoutMode === 'Flex' ? 'Flex' : 'Straight'}</span>
    <span className="whitespace-nowrap tabular-nums font-semibold text-slate-200">{money(bet.entryCost, bet.currencyCode)}</span>
    <span className="whitespace-nowrap tabular-nums font-semibold text-slate-200">{money(bet.expectedPayout, bet.currencyCode)}</span>
    <span><span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${statusStyle[bet.status]}`}>{displayEnum(bet.status)}</span></span>
    <span className={`whitespace-nowrap tabular-nums font-semibold ${bet.profitLoss == null ? 'text-slate-600' : bet.profitLoss >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{bet.profitLoss == null ? '—' : `${bet.profitLoss > 0 ? '+' : ''}${money(bet.profitLoss, bet.currencyCode)}`}</span>
    <span className="text-slate-400">{bet.timing}</span>
    <span className="truncate text-slate-400" title={bet.notes ?? ''}>{bet.notes || '—'}</span>
    <span className="truncate text-slate-400" title={bet.source?.name ?? 'Myself'}>{bet.source?.name ?? 'Myself'}</span>
    <span className="flex justify-end gap-2 whitespace-nowrap">{!bet.isArchived && <><button className="font-semibold text-slate-300 hover:text-white" onClick={onEdit}>Edit</button><button className="font-semibold text-emerald-300 hover:text-emerald-200" onClick={onSettle}>{bet.status === 'Pending' ? 'Settle' : 'Result'}</button></>}<button disabled={busy} className="font-semibold text-slate-500 hover:text-slate-300" onClick={onArchive}>{bet.isArchived ? 'Restore' : 'Archive'}</button></span>
  </div>
}

function Data({ label, value, sub }: { label: string; value: string; sub?: string }) { return <div><span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 lg:hidden">{label}</span><p className="font-semibold">{value}</p>{sub && <p className="text-xs text-slate-500">{sub}</p>}</div> }
