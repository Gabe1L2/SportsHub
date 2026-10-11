import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { BettingLookups, Platform } from '../features/betting/types'
import { money } from '../features/betting/types'
import onTheClockIntegrationCss from '../features/fantasy/onTheClockIntegration.css?raw'

type DraftStatus = 'Scheduled' | 'InProgress' | 'Active' | 'Completed' | 'Cancelled'
type Summary = { draftCount: number; activeDraftCount: number; completedDraftCount: number; totalBuyIns: number; totalWinnings: number; fantasyProfit: number; bettingProfit: number; totalSportsProfit: number }
type Draft = { id: string; name: string; sportName: string; platformId: string; platformName: string; status: DraftStatus; scheduledAtUtc: string | null; startedAtUtc: string | null; completedAtUtc: string | null; entrantCount: number; draftSlot: number | null; roundCount: number | null; buyIn: number; finishingPlace: number | null; winnings: number | null; profitLoss: number | null; currencyCode: string; notes: string | null }
type DraftInput = Omit<Draft, 'id' | 'platformName' | 'profitLoss' | 'currencyCode'> & { leagueId: string | null }
type Player = { id: string; name: string; league: string; team: string | null; position: string | null; isActive: boolean }
type Alias = { id: string; playerId: string; playerName: string; name: string; normalizedName: string }
type Tab = 'tracker' | 'assistant' | 'sources' | 'aliases'
type SourcePlayer = { id: string; name: string; rank?: number | null; adp?: number | null; pos?: string[]; posRaw?: string; team?: string; gp?: number | null; stats?: Record<string, number | null>; canonicalPlayerId?: string; canonicalName?: string; canonicalMatchType?: string }
type FantasySource = { id: string; name: string; kind: 'ranking' | 'adp' | 'projection'; platform: string; raw: string; created: string; archived?: boolean; basis?: string; players: SourcePlayer[] }
type FantasyWorkspaceState = { sources: FantasySource[] } & Record<string, unknown>
type WorkspaceResponse = { state: FantasyWorkspaceState | null }
type ReconciledPlayer = { sourceName: string; playerId: string; canonicalName: string; matchType: string; created: boolean; currentTeam: string | null; importedTeam: string | null; teamConflict: boolean }
type DraftFilters = { search: string; status: '' | DraftStatus; platformId: string; sort: string }
type DraftViewMode = 'comfortable' | 'compact'

const initialDraftFilters: DraftFilters = { search: '', status: '', platformId: '', sort: 'newest' }
const draftStatuses: DraftStatus[] = ['Scheduled', 'InProgress', 'Active', 'Completed', 'Cancelled']

const field = 'mt-1.5 w-full rounded-xl border border-white/15 bg-[#0b1626] px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400'
const secondary = 'rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/5 disabled:opacity-50'
const primary = 'rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-400 disabled:opacity-50'

export function FantasyPage() {
  const [tab, setTab] = useState<Tab>('tracker')
  const [editing, setEditing] = useState<DraftInput & { id?: string } | null>(null)
  const [error, setError] = useState('')
  const [draftFilters, setDraftFilters] = useState(initialDraftFilters)
  const [draftFiltersOpen, setDraftFiltersOpen] = useState(false)
  const [draftViewMode, setDraftViewMode] = useState<DraftViewMode>(() => localStorage.getItem('fantasy-draft-view-mode') === 'compact' ? 'compact' : 'comfortable')
  const client = useQueryClient()
  const summary = useQuery({ queryKey: ['fantasy', 'summary'], queryFn: () => api<Summary>('/api/fantasy/summary') })
  const drafts = useQuery({ queryKey: ['fantasy', 'drafts'], queryFn: () => api<Draft[]>('/api/fantasy/drafts') })
  const lookups = useQuery({ queryKey: ['betting', 'lookups'], queryFn: () => api<BettingLookups>('/api/betting/lookups') })
  const save = useMutation({
    mutationFn: (draft: DraftInput & { id?: string }) => api<Draft>(draft.id ? `/api/fantasy/drafts/${draft.id}` : '/api/fantasy/drafts', { method: draft.id ? 'PUT' : 'POST', body: JSON.stringify(toRequest(draft)) }),
    onSuccess: async () => { setEditing(null); setError(''); await Promise.all([client.invalidateQueries({ queryKey: ['fantasy', 'drafts'] }), client.invalidateQueries({ queryKey: ['fantasy', 'summary'] })]) },
    onError: reason => setError(reason instanceof Error ? reason.message : 'Could not save this draft.'),
  })
  const archive = useMutation({
    mutationFn: (id: string) => api<void>(`/api/fantasy/drafts/${id}`, { method: 'DELETE' }),
    onSuccess: async () => { await Promise.all([client.invalidateQueries({ queryKey: ['fantasy', 'drafts'] }), client.invalidateQueries({ queryKey: ['fantasy', 'summary'] })]) },
  })

  const platforms = lookups.data?.platforms.filter(x => x.isActive) ?? []
  useEffect(() => { localStorage.setItem('fantasy-draft-view-mode', draftViewMode) }, [draftViewMode])
  const visibleDrafts = useMemo(() => {
    const search = draftFilters.search.trim().toLocaleLowerCase()
    const filtered = (drafts.data ?? []).filter(draft => (!search || `${draft.name} ${draft.sportName} ${draft.platformName} ${draft.notes ?? ''}`.toLocaleLowerCase().includes(search)) && (!draftFilters.status || draft.status === draftFilters.status) && (!draftFilters.platformId || draft.platformId === draftFilters.platformId))
    const when = (draft: Draft) => new Date(draft.startedAtUtc ?? draft.scheduledAtUtc ?? 0).getTime()
    return [...filtered].sort((a, b) => draftFilters.sort === 'oldest' ? when(a) - when(b)
      : draftFilters.sort === 'buyInDesc' ? b.buyIn - a.buyIn
      : draftFilters.sort === 'buyInAsc' ? a.buyIn - b.buyIn
      : draftFilters.sort === 'winningsDesc' ? (b.winnings ?? -1) - (a.winnings ?? -1)
      : draftFilters.sort === 'pnlDesc' ? (b.profitLoss ?? -Infinity) - (a.profitLoss ?? -Infinity)
      : draftFilters.sort === 'pnlAsc' ? (a.profitLoss ?? Infinity) - (b.profitLoss ?? Infinity)
      : draftFilters.sort === 'finish' ? (a.finishingPlace ?? Infinity) - (b.finishingPlace ?? Infinity)
      : draftFilters.sort === 'name' ? a.name.localeCompare(b.name)
      : draftFilters.sort === 'status' ? a.status.localeCompare(b.status) || when(b) - when(a)
      : when(b) - when(a))
  }, [drafts.data, draftFilters])
  const draftListFiltered = draftFilters.search || draftFilters.status || draftFilters.platformId
  function setDraftFilter<K extends keyof DraftFilters>(key: K, value: DraftFilters[K]) { setDraftFilters(current => ({ ...current, [key]: value })) }
  useEffect(() => {
    const host = window as Window & { mountOnTheClock?: () => void }
    let styles = document.getElementById('on-the-clock-embedded-styles') as HTMLStyleElement | null
    if (!styles) {
      styles = document.createElement('style')
      styles.id = 'on-the-clock-embedded-styles'
      document.head.append(styles)
    }
    void fetch('/on-the-clock/style.css').then(response => response.text()).then(css => {
      styles!.textContent = `#fantasy-draft-assistant{font-family:Inter,ui-sans-serif,system-ui,sans-serif;font-size:14px;--green:#8b5cf6;--dark:#111d2e;--muted:#94a3b8;--line:rgba(255,255,255,.1);--orange:#a78bfa;--cream:#111d2e}@scope (#fantasy-draft-assistant){${css}}${onTheClockIntegrationCss}`
    })
    if (host.mountOnTheClock) host.mountOnTheClock()
    else if (!document.getElementById('on-the-clock-module')) {
      const script = document.createElement('script')
      script.id = 'on-the-clock-module'
      script.type = 'module'
      script.src = '/on-the-clock/app.js?v=20261010-custom-drafts'
      document.head.append(script)
    }
  }, [])
  useEffect(() => {
    const blockHiddenAssistantShortcuts = (event: KeyboardEvent) => {
      if (tab !== 'assistant' && (event.key === '/' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z'))) event.stopImmediatePropagation()
    }
    document.addEventListener('keydown', blockHiddenAssistantShortcuts, true)
    return () => document.removeEventListener('keydown', blockHiddenAssistantShortcuts, true)
  }, [tab])
  useEffect(() => {
    if (tab !== 'assistant') return
    const host = window as Window & { refreshOnTheClockWorkspace?: () => Promise<boolean> }
    void host.refreshOnTheClockWorkspace?.()
  }, [tab])
  async function selectTab(next: Tab) {
    if (tab === 'assistant' && next === 'tracker') {
      const host = window as Window & { flushOnTheClockWorkspace?: () => Promise<boolean> }
      await host.flushOnTheClockWorkspace?.()
      await Promise.all([client.refetchQueries({ queryKey: ['fantasy', 'drafts'] }), client.refetchQueries({ queryKey: ['fantasy', 'summary'] })])
    }
    setTab(next)
  }
  function newDraft() { setError(''); setEditing(emptyDraft(platforms[0]?.id ?? '')) }
  function editDraft(draft: Draft) { setError(''); setEditing({ ...draft, leagueId: null }) }

  return <section>
    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div><p className="text-sm font-bold uppercase tracking-[.22em] text-violet-300">Fantasy</p><h1 className="mt-2 text-4xl font-black tracking-tight md:text-5xl">{tab === 'assistant' ? 'Draft room' : tab === 'sources' ? 'Source library' : tab === 'aliases' ? 'Player identity' : 'Fantasy results'}</h1><p className="mt-3 max-w-3xl text-slate-400">{tab === 'assistant' ? 'Your board, projections, live picks, and roster decisions in one workspace.' : tab === 'sources' ? 'Inspect every imported ranking, ADP, and projection row feeding your draft room.' : tab === 'aliases' ? 'Teach SportsHub the nicknames and source spellings that belong to each player.' : 'Track every entry, finish, payout, and fantasy result without mixing it into betting P&L.'}</p></div>
      {tab === 'tracker' && <div className="flex flex-wrap gap-2"><div className="flex rounded-xl border border-white/15 bg-white/5 p-1" aria-label="Draft results view"><button className={`rounded-lg px-3 py-2 text-sm font-semibold ${draftViewMode === 'comfortable' ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-white'}`} onClick={() => setDraftViewMode('comfortable')}>Comfortable</button><button className={`rounded-lg px-3 py-2 text-sm font-semibold ${draftViewMode === 'compact' ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-white'}`} onClick={() => setDraftViewMode('compact')}>Compact</button></div><button className={primary} onClick={newDraft} disabled={!platforms.length}>+ Track a draft</button></div>}
    </div>

    <div className="mt-7 flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-white/[.03] p-1">
      {([['tracker', 'Results & P&L'], ['assistant', 'Draft assistant'], ['sources', 'Sources'], ['aliases', 'Player aliases']] as const).map(([key, label]) => <button key={key} className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold ${tab === key ? 'bg-violet-500 text-white' : 'text-slate-400 hover:text-white'}`} onClick={() => void selectTab(key)}>{label}</button>)}
    </div>

    {tab === 'tracker' && <>
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="Drafts" value={summary.data?.draftCount.toLocaleString() ?? '—'} detail={`${summary.data?.activeDraftCount ?? 0} active`} />
        <Metric label="Completed" value={summary.data?.completedDraftCount.toLocaleString() ?? '—'} detail="Settled entries" />
        <Metric label="Buy-ins" value={summary.data ? money(summary.data.totalBuyIns) : '—'} detail="All non-cancelled" />
        <Metric label="Winnings" value={summary.data ? money(summary.data.totalWinnings) : '—'} detail="Completed drafts" />
        <Metric label="Fantasy P&L" value={summary.data ? signedMoney(summary.data.fantasyProfit) : '—'} detail="Winnings less buy-ins" tone={tone(summary.data?.fantasyProfit)} />
        <Metric label="Total sports P&L" value={summary.data ? signedMoney(summary.data.totalSportsProfit) : '—'} detail="Betting + fantasy" tone={tone(summary.data?.totalSportsProfit)} />
      </div>
      {!platforms.length && <div className="mt-6 rounded-xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">Add an active platform from Betting → Manage platforms before tracking a fantasy draft. The same DraftKings or Underdog platform is used by both areas.</div>}
      <div className="mt-6 rounded-2xl border border-white/10 bg-white/[.035] p-3 sm:p-4">
        <div className="flex gap-2 md:contents"><input className={`${field.replace('mt-1.5 ', '')} min-w-0 flex-1`} type="search" placeholder="Search drafts" value={draftFilters.search} onChange={event => setDraftFilter('search', event.target.value)} /><button type="button" className={`${secondary} shrink-0 md:hidden`} onClick={() => setDraftFiltersOpen(open => !open)}>Filters{draftListFiltered ? ' •' : ''} {draftFiltersOpen ? '▲' : '▼'}</button></div>
        <div className={`${draftFiltersOpen ? 'grid' : 'hidden'} mt-3 grid-cols-2 gap-2 md:mt-0 md:grid md:grid-cols-3 md:gap-3`}>
          <select className={field.replace('mt-1.5 ', '')} value={draftFilters.status} onChange={event => setDraftFilter('status', event.target.value as DraftFilters['status'])}><option value="">All statuses</option>{draftStatuses.map(status => <option key={status} value={status}>{displayStatus(status)}</option>)}</select>
          <select className={field.replace('mt-1.5 ', '')} value={draftFilters.platformId} onChange={event => setDraftFilter('platformId', event.target.value)}><option value="">All platforms</option>{lookups.data?.platforms.map(platform => <option key={platform.id} value={platform.id}>{platform.name}</option>)}</select>
          <select className={field.replace('mt-1.5 ', '')} value={draftFilters.sort} onChange={event => setDraftFilter('sort', event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="buyInDesc">Highest buy-in</option><option value="buyInAsc">Lowest buy-in</option><option value="winningsDesc">Highest winnings</option><option value="pnlDesc">Highest P&amp;L</option><option value="pnlAsc">Lowest P&amp;L</option><option value="finish">Best finish</option><option value="status">Status</option><option value="name">Draft name</option></select>
        </div>
        <div className={`${draftFiltersOpen ? 'flex' : 'hidden'} mt-3 items-center justify-between gap-3 md:flex`}><p className="text-xs text-slate-500">Showing {visibleDrafts.length} of {drafts.data?.length ?? 0} drafts</p>{draftListFiltered && <button className="text-xs font-semibold text-violet-300 hover:text-violet-200" onClick={() => setDraftFilters(current => ({ ...initialDraftFilters, sort: current.sort }))}>Clear filters</button>}</div>
      </div>
      <div className="mt-5">
        {drafts.isLoading ? <div className="rounded-2xl border border-white/10 bg-white/[.025] p-6 text-slate-400">Loading drafts…</div> : drafts.error ? <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-6 text-rose-300">{drafts.error.message}</div> : !drafts.data?.length ? <div className="rounded-2xl border border-white/10 bg-white/[.025] p-10 text-center"><h2 className="text-xl font-bold">No fantasy drafts tracked yet</h2><p className="mt-2 text-sm text-slate-400">Add a contest to start measuring fantasy performance separately from betting.</p></div> : !visibleDrafts.length ? <div className="rounded-2xl border border-white/10 bg-white/[.025] p-10 text-center"><h2 className="text-xl font-bold">No drafts match these filters</h2><p className="mt-2 text-sm text-slate-400">Try clearing one or more filters.</p></div> : draftViewMode === 'compact' ? <CompactDraftTable drafts={visibleDrafts} onEdit={editDraft} onArchive={draft => { if (window.confirm(`Archive ${draft.name}?`)) archive.mutate(draft.id) }} busy={archive.isPending} /> : <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[.025]"><div className="divide-y divide-white/10">{visibleDrafts.map(draft => <DraftRow key={draft.id} draft={draft} onEdit={() => editDraft(draft)} onArchive={() => { if (window.confirm(`Archive ${draft.name}?`)) archive.mutate(draft.id) }} />)}</div></div>}
      </div>
    </>}

    <div className={tab === 'assistant' ? 'mt-6' : 'hidden'}>
      <div id="fantasy-draft-assistant"><div id="app" /><dialog id="modal" aria-labelledby="modal-title" /><div id="toast" role="status" aria-live="polite" /></div>
    </div>
    {tab === 'sources' && <SourceLibrary />}
    {tab === 'aliases' && <AliasManager />}
    {editing && <DraftDialog draft={editing} platforms={platforms} error={error} saving={save.isPending} onClose={() => setEditing(null)} onSave={value => save.mutate(value)} />}
  </section>
}

function SourceLibrary() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sourceSearch, setSourceSearch] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [renameValue, setRenameValue] = useState<string | null>(null)
  const [renameError, setRenameError] = useState('')
  const [positionError, setPositionError] = useState('')
  const [teamConflicts, setTeamConflicts] = useState<ReconciledPlayer[]>([])
  const client = useQueryClient()
  const workspace = useQuery({ queryKey: ['fantasy', 'workspace', 'sources'], queryFn: () => api<WorkspaceResponse>('/api/fantasy/workspace') })
  const sources = workspace.data?.state?.sources ?? []
  const archivedCount = sources.filter(source => source.archived).length
  const normalizedSearch = sourceSearch.trim().toLocaleLowerCase()
  const visibleSources = sources.filter(source => (!source.archived || includeArchived) && (!normalizedSearch || `${source.name} ${source.kind} ${source.platform}`.toLocaleLowerCase().includes(normalizedSearch)))
  const selected = visibleSources.find(source => source.id === selectedId) ?? visibleSources[0]
  const reconcile = useMutation({
    mutationFn: async (current: FantasyWorkspaceState) => {
      const rows = current.sources.flatMap(source => source.players).map(player => ({ name: player.name, teamAbbreviation: player.team || null, position: player.pos?.join('/') || player.posRaw || null }))
      const matches = await api<ReconciledPlayer[]>('/api/fantasy/players/reconcile', { method: 'POST', body: JSON.stringify({ rows, leagueAbbreviation: 'NBA' }) })
      const byName = new Map(matches.map(match => [match.sourceName, match]))
      const next = { ...current, sources: current.sources.map(source => ({ ...source, players: source.players.map(player => { const match = byName.get(player.name); return match ? { ...player, canonicalPlayerId: match.playerId, canonicalName: match.canonicalName, canonicalMatchType: match.matchType } : player }) })) }
      const host = window as Window & { reconcileOnTheClockSource?: (sourceId: string, matches: ReconciledPlayer[]) => boolean }
      current.sources.forEach(source => host.reconcileOnTheClockSource?.(source.id, matches))
      await api<void>('/api/fantasy/workspace', { method: 'PUT', body: JSON.stringify({ state: next }) })
      return { next, conflicts: [...new Map(matches.filter(match => match.teamConflict).map(match => [`${match.playerId}:${match.importedTeam}`, match])).values()] }
    },
    onSuccess: ({ next, conflicts }) => { client.setQueryData<WorkspaceResponse>(['fantasy', 'workspace', 'sources'], { state: next }); setTeamConflicts(conflicts) },
  })
  const { mutate: reconcileSources, isPending: isReconciling, isError: reconcileFailed } = reconcile
  const updateTeam = useMutation({
    mutationFn: (conflict: ReconciledPlayer) => api(`/api/fantasy/players/${conflict.playerId}/team`, { method: 'PUT', body: JSON.stringify({ teamAbbreviation: conflict.importedTeam }) }),
    onSuccess: (_result, conflict) => setTeamConflicts(current => current.filter(item => item !== conflict)),
  })
  useEffect(() => {
    const current = workspace.data?.state
    if (current && current.sources.some(source => source.players.some(player => !player.canonicalPlayerId)) && !isReconciling && !reconcileFailed) reconcileSources(current)
  }, [workspace.data?.state, isReconciling, reconcileFailed, reconcileSources])
  const rename = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const trimmed = name.trim()
      if (!trimmed || trimmed.length > 120) throw new Error('Use a source name between 1 and 120 characters.')
      const current = workspace.data?.state
      if (!current) throw new Error('The fantasy workspace is not loaded.')
      const host = window as Window & { renameOnTheClockSource?: (sourceId: string, sourceName: string) => boolean }
      host.renameOnTheClockSource?.(id, trimmed)
      const next = { ...current, sources: current.sources.map(source => source.id === id ? { ...source, name: trimmed } : source) }
      await api<void>('/api/fantasy/workspace', { method: 'PUT', body: JSON.stringify({ state: next }) })
      return next
    },
    onSuccess: next => { client.setQueryData<WorkspaceResponse>(['fantasy', 'workspace', 'sources'], { state: next }); setRenameValue(null); setRenameError('') },
    onError: reason => setRenameError(reason instanceof Error ? reason.message : 'Could not rename the source.'),
  })
  const updatePosition = useMutation({
    mutationFn: async ({ sourceId, playerId, position }: { sourceId: string; playerId: string; position: string }) => {
      const host = window as Window & { updateOnTheClockSourcePlayerPosition?: (sourceId: string, playerId: string, position: string) => Promise<boolean> }
      if (host.updateOnTheClockSourcePlayerPosition) {
        if (!await host.updateOnTheClockSourcePlayerPosition(sourceId, playerId, position)) throw new Error('Could not save the player position.')
        const latest = await api<WorkspaceResponse>('/api/fantasy/workspace')
        if (!latest.state) throw new Error('The fantasy workspace could not be reloaded.')
        return latest.state
      }
      const latest = await api<WorkspaceResponse>('/api/fantasy/workspace')
      if (!latest.state) throw new Error('The fantasy workspace is not loaded.')
      const source = latest.state.sources.find(source => source.id === sourceId)
      const player = source?.players.find(player => player.id === playerId)
      if (!source || !player) throw new Error('That imported player could not be found.')
      const pos = position ? position.split('/') : []
      player.pos = pos
      player.posRaw = position
      await api<void>('/api/fantasy/workspace', { method: 'PUT', body: JSON.stringify({ state: latest.state }) })
      return latest.state
    },
    onSuccess: next => { client.setQueryData<WorkspaceResponse>(['fantasy', 'workspace', 'sources'], { state: next }); setPositionError('') },
    onError: reason => setPositionError(reason instanceof Error ? reason.message : 'Could not update the player position.'),
  })
  function commitRename() {
    if (!selected || renameValue === null || rename.isPending) return
    if (renameValue.trim() === selected.name) { setRenameValue(null); setRenameError(''); return }
    rename.mutate({ id: selected.id, name: renameValue })
  }

  if (workspace.isLoading) return <div className="mt-6 rounded-2xl border border-white/10 bg-white/[.035] p-8 text-slate-400">Loading imported sources…</div>
  if (workspace.error) return <div className="mt-6 rounded-2xl border border-rose-400/20 bg-rose-400/10 p-5 text-rose-200">{workspace.error.message}</div>
  if (!sources.length) return <div className="mt-6 rounded-2xl border border-white/10 bg-white/[.035] p-10 text-center"><h2 className="text-xl font-black">No imported sources yet</h2><p className="mt-2 text-sm text-slate-400">Use Import rankings / ADP in the Draft assistant. Saved sources will appear here with every imported row.</p></div>

  return <><div className="mt-6 grid gap-5 lg:grid-cols-[270px_minmax(0,1fr)]">
    <aside className="overflow-hidden rounded-2xl border border-white/10 bg-white/[.03]">
      <div className="border-b border-white/10 px-4 py-3"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Imported data</p><p className="mt-1 text-sm text-slate-400">{sources.length - archivedCount} active source{sources.length - archivedCount === 1 ? '' : 's'}</p><input className={`${field} mt-3 py-2`} type="search" placeholder="Search sources" aria-label="Search sources" value={sourceSearch} onChange={event => setSourceSearch(event.target.value)} /><label className="mt-3 flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-400"><input type="checkbox" className="accent-violet-500" checked={includeArchived} onChange={event => { setIncludeArchived(event.target.checked); setRenameValue(null); setRenameError('') }} />Include archived{archivedCount ? ` (${archivedCount})` : ''}</label></div>
      <div className="divide-y divide-white/[.07]">{visibleSources.map(source => <button key={source.id} className={`block w-full px-4 py-3 text-left transition ${selected?.id === source.id ? 'bg-violet-400/10' : 'hover:bg-white/[.035]'}`} onClick={() => { setSelectedId(source.id); setRenameValue(null); setRenameError(''); setPositionError('') }}><span className="flex items-center justify-between gap-2"><strong className="truncate text-sm text-slate-100">{source.name}</strong>{source.archived && <span className="text-[9px] font-bold uppercase text-slate-500">Archived</span>}</span><span className="mt-1 block text-xs text-slate-500">{sourceLabel(source.kind)} · {source.platform} · {source.players.length} rows</span></button>)}{!visibleSources.length && <div className="px-4 py-8 text-center text-sm text-slate-500">{sourceSearch.trim() ? 'No sources match your search.' : includeArchived ? 'No sources to show.' : 'No active sources.'}</div>}</div>
    </aside>
    {selected && <section className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[.025]">
      <div className="flex flex-col gap-4 border-b border-white/10 p-5 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2">{renameValue === null ? <button className="rounded-md text-left text-xl font-black text-white decoration-violet-400 decoration-dashed underline-offset-4 hover:underline focus:outline-none focus:ring-2 focus:ring-violet-400/60" title="Click to edit source name" onClick={() => { setRenameValue(selected.name); setRenameError('') }}>{selected.name}</button> : <input className="min-w-[220px] max-w-xl flex-1 rounded-lg border border-violet-400/60 bg-[#0b1626] px-2.5 py-1 text-xl font-black text-white outline-none ring-2 ring-violet-400/20" aria-label="Source name" autoFocus maxLength={120} disabled={rename.isPending} value={renameValue} onChange={event => setRenameValue(event.target.value)} onBlur={commitRename} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() } else if (event.key === 'Escape') { setRenameValue(null); setRenameError('') } }} />}<span className="rounded-md bg-violet-400/10 px-2 py-1 text-[10px] font-bold uppercase text-violet-300">{sourceLabel(selected.kind)}</span>{rename.isPending && <span className="text-xs text-slate-500">Saving…</span>}</div>{renameError && <p className="mt-2 text-sm text-rose-300">{renameError}</p>}{positionError && <p className="mt-2 text-sm text-rose-300">{positionError}</p>}<p className="mt-2 text-sm text-slate-500">{selected.platform} · Imported {new Date(selected.created).toLocaleString()} · {selected.players.length} players{selected.basis ? ` · ${selected.basis === 'perGame' ? 'Per game' : 'Season totals'}` : ''}</p></div><button className={secondary} onClick={() => downloadSource(selected)}>Download original</button></div>
      <div className="max-h-[650px] overflow-auto"><table className="min-w-[720px] w-full border-collapse text-left text-xs"><thead className="sticky top-0 z-10 bg-[#111d2e] text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Player</th><th className="px-3 py-3">Rank</th><th className="px-3 py-3">ADP</th><th className="px-3 py-3">Position</th><th className="px-3 py-3">Team</th>{selected.kind === 'projection' && <><th className="px-3 py-3">GP</th><th className="px-3 py-3">PTS</th></>}<th className="px-4 py-3">SportsHub match</th></tr></thead><tbody className="divide-y divide-white/[.07]">{selected.players.map((player, index) => <tr key={`${player.id}-${index}`} className="hover:bg-white/[.025]"><td className="px-4 py-3 font-semibold text-slate-100">{player.name}</td><td className="px-3 py-3 tabular-nums text-slate-400">{player.rank ?? '—'}</td><td className="px-3 py-3 tabular-nums text-slate-400">{player.adp ?? '—'}</td><td className="px-3 py-2"><select className="min-w-20 rounded-md border border-white/10 bg-[#0b1626] px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-violet-400" aria-label={`Position for ${player.name}`} disabled={updatePosition.isPending} value={['G', 'F', 'C'].filter(position => player.pos?.includes(position)).join('/')} onChange={event => updatePosition.mutate({ sourceId: selected.id, playerId: player.id, position: event.target.value })}>{(selected.kind === 'adp' ? ['', 'G', 'F', 'C'] : ['', 'G', 'F', 'C', 'G/F', 'G/C', 'F/C', 'G/F/C']).map(position => <option key={position} value={position}>{position || 'None'}</option>)}</select></td><td className="px-3 py-3 text-slate-400">{player.team || '—'}</td>{selected.kind === 'projection' && <><td className="px-3 py-3 tabular-nums text-slate-400">{player.gp ?? '—'}</td><td className="px-3 py-3 tabular-nums text-slate-400">{player.stats?.PTS ?? '—'}</td></>}<td className="px-4 py-3">{player.canonicalPlayerId ? <span className="text-emerald-300">{player.canonicalName ?? 'Matched'}</span> : <span className="text-amber-300/80">Unmatched</span>}</td></tr>)}</tbody></table></div>
    </section>}
  </div>{teamConflicts.length > 0 && <div className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-black/75 p-4" role="dialog" aria-modal="true"><div className="my-6 w-full max-w-2xl overflow-hidden rounded-2xl border border-white/15 bg-[#111d2e] shadow-2xl"><div className="border-b border-white/10 p-5"><h2 className="text-xl font-black">Review player teams</h2><p className="mt-2 text-sm text-slate-400">Your import disagrees with a saved team. Use the imported team only if this source is newer.</p></div><div className="max-h-[60vh] divide-y divide-white/10 overflow-y-auto">{teamConflicts.map(conflict => <div key={`${conflict.playerId}-${conflict.importedTeam}`} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div><strong>{conflict.canonicalName}</strong><p className="mt-1 text-sm text-slate-400">SportsHub: {conflict.currentTeam} · Imported: {conflict.importedTeam}</p></div><div className="flex gap-2"><button className={secondary} onClick={() => setTeamConflicts(current => current.filter(item => item !== conflict))}>Keep {conflict.currentTeam}</button><button className={primary} disabled={updateTeam.isPending} onClick={() => updateTeam.mutate(conflict)}>Use {conflict.importedTeam}</button></div></div>)}</div></div></div>}</>
}

function Metric({ label, value, detail, tone: color }: { label: string; value: string; detail: string; tone?: 'positive' | 'negative' }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[.04] p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p><p className={`mt-2 text-xl font-black ${color === 'positive' ? 'text-emerald-300' : color === 'negative' ? 'text-rose-300' : ''}`}>{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>
}

function CompactDraftTable({ drafts, onEdit, onArchive, busy }: { drafts: Draft[]; onEdit: (draft: Draft) => void; onArchive: (draft: Draft) => void; busy: boolean }) {
  const columns = 'grid-cols-[120px_minmax(180px,1.4fr)_130px_105px_80px_70px_90px_75px_95px_95px_105px]'
  return <div className="relative left-1/2 w-[calc(100vw-2rem)] max-w-[1700px] -translate-x-1/2">
    <div className="divide-y divide-white/[.07] overflow-hidden rounded-xl border border-white/10 bg-[#0b1626] shadow-xl shadow-black/10 md:hidden">{drafts.map((draft, index) => <MobileCompactDraftRow key={draft.id} draft={draft} alternate={index % 2 === 1} onEdit={() => onEdit(draft)} onArchive={() => onArchive(draft)} busy={busy} />)}</div>
    <div className="hidden max-h-[68vh] overflow-auto rounded-xl border border-white/10 bg-[#0b1626] shadow-xl shadow-black/10 md:block">
      <div className={`sticky top-0 z-10 grid min-w-[1250px] ${columns} items-center gap-2 border-b border-white/15 bg-[#111d2e] px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-400`}><span>Date</span><span>Draft</span><span>Platform</span><span>Status</span><span>Entrants</span><span>Slot</span><span>Buy-in</span><span>Finish</span><span>Winnings</span><span>P&amp;L</span><span className="text-right">Actions</span></div>
      <div className="min-w-[1250px] divide-y divide-white/[.06]">{drafts.map((draft, index) => <CompactDraftRow key={draft.id} draft={draft} columns={columns} alternate={index % 2 === 1} onEdit={() => onEdit(draft)} onArchive={() => onArchive(draft)} busy={busy} />)}</div>
    </div>
  </div>
}

function MobileCompactDraftRow({ draft, alternate, onEdit, onArchive, busy }: { draft: Draft; alternate: boolean; onEdit: () => void; onArchive: () => void; busy: boolean }) {
  const when = draft.startedAtUtc ?? draft.scheduledAtUtc
  return <article className={`px-3 py-2.5 ${alternate ? 'bg-white/[.018]' : ''}`}>
    <div className="flex min-w-0 items-center justify-between gap-3"><strong className="truncate text-sm text-slate-100">{draft.name}</strong><strong className="shrink-0 text-sm tabular-nums">{money(draft.buyIn)}</strong></div>
    <div className="mt-1 flex items-center justify-between gap-3 text-[11px] text-slate-500"><span className="truncate">{draft.platformName}{when ? ` · ${new Date(when).toLocaleDateString()}` : ''} · {draft.entrantCount.toLocaleString()} entries</span><span className={`shrink-0 font-semibold ${tone(draft.profitLoss) === 'positive' ? 'text-emerald-300' : tone(draft.profitLoss) === 'negative' ? 'text-rose-300' : 'text-slate-500'}`}>{draft.profitLoss == null ? '—' : signedMoney(draft.profitLoss)}</span></div>
    <div className="mt-2 flex items-center justify-between gap-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${draftStatusClass(draft.status)}`}>{displayStatus(draft.status)}</span><span className="flex shrink-0 gap-3 text-[11px]"><button className="font-semibold text-violet-300" onClick={onEdit}>Edit</button><button disabled={busy} className="font-semibold text-slate-500" onClick={onArchive}>Archive</button></span></div>
  </article>
}

function CompactDraftRow({ draft, columns, alternate, onEdit, onArchive, busy }: { draft: Draft; columns: string; alternate: boolean; onEdit: () => void; onArchive: () => void; busy: boolean }) {
  const when = draft.startedAtUtc ?? draft.scheduledAtUtc
  return <div className={`grid ${columns} items-center gap-2 px-3 py-1.5 text-xs transition hover:bg-violet-400/[.055] ${alternate ? 'bg-white/[.018]' : ''}`}>
    <span className="whitespace-nowrap tabular-nums text-slate-400">{when ? new Date(when).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: '2-digit' }) : '—'}</span>
    <span className="truncate font-semibold text-slate-100" title={draft.name}>{draft.name}</span>
    <span className="truncate text-slate-400">{draft.platformName}</span>
    <span><span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${draftStatusClass(draft.status)}`}>{displayStatus(draft.status)}</span></span>
    <span className="tabular-nums text-slate-300">{draft.entrantCount.toLocaleString()}</span>
    <span className="tabular-nums text-slate-400">{draft.draftSlot ?? '—'}</span>
    <span className="whitespace-nowrap tabular-nums font-semibold text-slate-200">{money(draft.buyIn)}</span>
    <span className="tabular-nums text-slate-300">{draft.finishingPlace ? ordinal(draft.finishingPlace) : '—'}</span>
    <span className="whitespace-nowrap tabular-nums text-slate-300">{draft.winnings == null ? '—' : money(draft.winnings)}</span>
    <span className={`whitespace-nowrap tabular-nums font-semibold ${draft.profitLoss == null ? 'text-slate-600' : draft.profitLoss >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{draft.profitLoss == null ? '—' : signedMoney(draft.profitLoss)}</span>
    <span className="flex justify-end gap-2 whitespace-nowrap"><button className="font-semibold text-violet-300 hover:text-violet-200" onClick={onEdit}>Edit</button><button disabled={busy} className="font-semibold text-slate-500 hover:text-slate-300" onClick={onArchive}>Archive</button></span>
  </div>
}

function draftStatusClass(status: DraftStatus) { return status === 'Completed' ? 'bg-emerald-400/10 text-emerald-300' : status === 'Cancelled' ? 'bg-slate-400/10 text-slate-400' : status === 'InProgress' || status === 'Active' ? 'bg-amber-400/10 text-amber-300' : 'bg-violet-400/10 text-violet-300' }

function DraftRow({ draft, onEdit, onArchive }: { draft: Draft; onEdit: () => void; onArchive: () => void }) {
  const when = draft.startedAtUtc ?? draft.scheduledAtUtc
  return <article className="grid gap-4 p-5 lg:grid-cols-[1.5fr_.8fr_.65fr_.65fr_.75fr_auto] lg:items-center">
    <div><div className="flex flex-wrap items-center gap-2"><h2 className="font-bold text-white">{draft.name}</h2><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${draft.status === 'Completed' ? 'bg-emerald-400/10 text-emerald-300' : draft.status === 'Cancelled' ? 'bg-slate-400/10 text-slate-400' : 'bg-violet-400/10 text-violet-300'}`}>{displayStatus(draft.status)}</span></div><p className="mt-1 text-xs text-slate-500">{draft.sportName} · {draft.platformName}{when ? ` · ${new Date(when).toLocaleDateString()}` : ''}</p>{draft.notes && <p className="mt-2 line-clamp-1 text-xs text-slate-400">{draft.notes}</p>}</div>
    <Cell label="Field" value={`${draft.entrantCount.toLocaleString()} entrants`} sub={draft.draftSlot ? `Draft slot ${draft.draftSlot}` : undefined} />
    <Cell label="Buy-in" value={money(draft.buyIn)} />
    <Cell label="Finish" value={draft.finishingPlace ? ordinal(draft.finishingPlace) : '—'} />
    <Cell label="P&L" value={draft.profitLoss == null ? '—' : signedMoney(draft.profitLoss)} color={tone(draft.profitLoss)} sub={draft.winnings == null ? undefined : `${money(draft.winnings)} won`} />
    <div className="flex gap-3 lg:justify-end"><button className="text-sm font-semibold text-violet-300" onClick={onEdit}>Edit</button><button className="text-sm font-semibold text-slate-500" onClick={onArchive}>Archive</button></div>
  </article>
}

function Cell({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: 'positive' | 'negative' }) { return <div><span className="text-[10px] font-bold uppercase text-slate-600">{label}</span><p className={`font-semibold ${color === 'positive' ? 'text-emerald-300' : color === 'negative' ? 'text-rose-300' : ''}`}>{value}</p>{sub && <p className="text-xs text-slate-500">{sub}</p>}</div> }

function DraftDialog({ draft, platforms, error, saving, onClose, onSave }: { draft: DraftInput & { id?: string }; platforms: Platform[]; error: string; saving: boolean; onClose: () => void; onSave: (draft: DraftInput & { id?: string }) => void }) {
  const [value, setValue] = useState(draft)
  const completed = value.status === 'Completed'
  const set = <K extends keyof typeof value>(key: K, next: typeof value[K]) => setValue(current => ({ ...current, [key]: next }))
  return <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4" role="dialog" aria-modal="true"><form className="my-6 w-full max-w-3xl rounded-2xl border border-white/15 bg-[#111d2e] p-5 shadow-2xl" onSubmit={event => { event.preventDefault(); onSave(value) }}>
    <div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-violet-300">Fantasy entry</p><h2 className="mt-1 text-2xl font-black">{value.id ? 'Update draft' : 'Track a draft'}</h2></div><button type="button" className="text-2xl text-slate-400" onClick={onClose}>×</button></div>
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <Label text="Draft name"><input className={field} required maxLength={160} value={value.name} onChange={e => set('name', e.target.value)} /></Label>
      <Label text="Platform"><select className={field} required value={value.platformId} onChange={e => set('platformId', e.target.value)}><option value="">Select platform</option>{platforms.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Label>
      <Label text="Sport"><input className={field} required maxLength={80} value={value.sportName} onChange={e => set('sportName', e.target.value)} /></Label>
      <Label text="Status"><select className={field} value={value.status} onChange={e => set('status', e.target.value as DraftStatus)}>{(['Scheduled', 'InProgress', 'Active', 'Completed', 'Cancelled'] as const).map(x => <option key={x} value={x}>{displayStatus(x)}</option>)}</select></Label>
      <Label text="Draft / start date"><input className={field} type="datetime-local" value={toLocal(value.startedAtUtc)} onChange={e => set('startedAtUtc', e.target.value ? new Date(e.target.value).toISOString() : null)} /></Label>
      <Label text="Number of entrants"><input className={field} type="number" min={2} max={100000} required value={value.entrantCount} onChange={e => set('entrantCount', Number(e.target.value))} /></Label>
      <Label text="Draft slot"><input className={field} type="number" min={1} max={value.entrantCount} value={value.draftSlot ?? ''} onChange={e => set('draftSlot', nullableNumber(e.target.value))} /></Label>
      <Label text="Rounds"><input className={field} type="number" min={1} max={100} value={value.roundCount ?? ''} onChange={e => set('roundCount', nullableNumber(e.target.value))} /></Label>
      <Label text="Buy-in"><input className={field} type="number" min={0} step="0.01" required value={value.buyIn} onChange={e => set('buyIn', Number(e.target.value))} /></Label>
      <Label text="Winnings"><input className={field} type="number" min={0} step="0.01" disabled={!completed} value={value.winnings ?? ''} onChange={e => set('winnings', nullableNumber(e.target.value))} /></Label>
      <Label text="Finishing place"><input className={field} type="number" min={1} max={value.entrantCount} disabled={!completed} value={value.finishingPlace ?? ''} onChange={e => set('finishingPlace', nullableNumber(e.target.value))} /></Label>
      {completed && <Label text="Completed date"><input className={field} type="datetime-local" value={toLocal(value.completedAtUtc)} onChange={e => set('completedAtUtc', e.target.value ? new Date(e.target.value).toISOString() : null)} /></Label>}
      <label className="sm:col-span-2"><span className="text-sm font-semibold text-slate-300">Notes</span><textarea className={`${field} min-h-24 resize-y`} maxLength={2000} value={value.notes ?? ''} onChange={e => set('notes', e.target.value)} /></label>
    </div>
    {error && <p className="mt-4 rounded-xl bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</p>}
    <div className="mt-5 flex justify-end gap-3"><button type="button" className={secondary} onClick={onClose}>Cancel</button><button className={primary} disabled={saving}>{saving ? 'Saving…' : 'Save draft'}</button></div>
  </form></div>
}

function AliasManager() {
  const [search, setSearch] = useState('')
  const [playerId, setPlayerId] = useState('')
  const [name, setName] = useState('')
  const [newPlayer, setNewPlayer] = useState({ firstName: '', lastName: '', displayName: '', teamAbbreviation: '', position: '' })
  const [mergeSearch, setMergeSearch] = useState('')
  const [duplicatePlayerId, setDuplicatePlayerId] = useState('')
  const [targetPlayerId, setTargetPlayerId] = useState('')
  const [error, setError] = useState('')
  const client = useQueryClient()
  const players = useQuery({ queryKey: ['players', search], queryFn: () => api<Player[]>(`/api/players?pageSize=100&search=${encodeURIComponent(search)}`) })
  const aliases = useQuery({ queryKey: ['fantasy', 'aliases'], queryFn: () => api<Alias[]>('/api/fantasy/player-aliases') })
  const mergePlayers = useQuery({ queryKey: ['players', 'merge', mergeSearch], queryFn: () => api<Player[]>(`/api/players?pageSize=100&search=${encodeURIComponent(mergeSearch)}`) })
  const add = useMutation({ mutationFn: () => api<Alias>('/api/fantasy/player-aliases', { method: 'POST', body: JSON.stringify({ playerId, name }) }), onSuccess: async () => { setName(''); setError(''); await client.invalidateQueries({ queryKey: ['fantasy', 'aliases'] }) }, onError: reason => setError(reason instanceof Error ? reason.message : 'Could not save alias.') })
  const createPlayer = useMutation({ mutationFn: () => api<{ id: string; name: string }>('/api/fantasy/players', { method: 'POST', body: JSON.stringify(newPlayer) }), onSuccess: async player => { setPlayerId(player.id); setSearch(player.name); setNewPlayer({ firstName: '', lastName: '', displayName: '', teamAbbreviation: '', position: '' }); setError(''); await client.invalidateQueries({ queryKey: ['players'] }) }, onError: reason => setError(reason instanceof Error ? reason.message : 'Could not create player.') })
  const remove = useMutation({ mutationFn: (id: string) => api<void>(`/api/fantasy/player-aliases/${id}`, { method: 'DELETE' }), onSuccess: () => client.invalidateQueries({ queryKey: ['fantasy', 'aliases'] }) })
  const merge = useMutation({ mutationFn: () => api<Player>('/api/fantasy/players/merge', { method: 'POST', body: JSON.stringify({ duplicatePlayerId, targetPlayerId }) }), onSuccess: async player => { const host = window as Window & { mergeOnTheClockPlayers?: (duplicateId: string, targetId: string, targetName: string) => boolean }; host.mergeOnTheClockPlayers?.(duplicatePlayerId, player.id, player.name); setDuplicatePlayerId(''); setTargetPlayerId(''); setError(''); await Promise.all([client.invalidateQueries({ queryKey: ['players'] }), client.invalidateQueries({ queryKey: ['fantasy', 'aliases'] }), client.invalidateQueries({ queryKey: ['fantasy', 'workspace'] })]) }, onError: reason => setError(reason instanceof Error ? reason.message : 'Could not merge these players.') })
  return <div className="mt-6 grid gap-6 lg:grid-cols-[.9fr_1.1fr]">
    <div className="rounded-2xl border border-white/10 bg-white/[.035] p-5"><h2 className="text-xl font-black">Add a known name</h2><p className="mt-2 text-sm text-slate-400">Aliases are shared across SportsHub. Exact normalized matches—including punctuation and accents—will resolve automatically on future imports.</p><label className="mt-5 block text-sm font-semibold text-slate-300">Find canonical player<input className={field} placeholder="Search players or aliases" value={search} onChange={e => setSearch(e.target.value)} /></label><label className="mt-4 block text-sm font-semibold text-slate-300">Player<select className={field} value={playerId} onChange={e => setPlayerId(e.target.value)}><option value="">Select player</option>{players.data?.map(x => <option key={x.id} value={x.id}>{x.name} · {x.league}{x.team ? ` · ${x.team}` : ''}</option>)}</select></label><label className="mt-4 block text-sm font-semibold text-slate-300">Nickname or source spelling<input className={field} placeholder="e.g. SGA" value={name} onChange={e => setName(e.target.value)} /></label>{error && <p className="mt-3 text-sm text-rose-300">{error}</p>}<button className={`${primary} mt-5`} disabled={!playerId || name.trim().length < 2 || add.isPending} onClick={() => add.mutate()}>Add alias</button>
      <details className="mt-6 border-t border-white/10 pt-5"><summary className="cursor-pointer text-sm font-bold text-violet-300">Player not in SportsHub yet?</summary><p className="mt-2 text-xs text-slate-500">Imports now create missing players automatically. You can still create one manually here.</p><div className="mt-3 grid grid-cols-2 gap-3"><input className={field} placeholder="First name" value={newPlayer.firstName} onChange={e => setNewPlayer(x => ({ ...x, firstName: e.target.value }))} /><input className={field} placeholder="Last name" value={newPlayer.lastName} onChange={e => setNewPlayer(x => ({ ...x, lastName: e.target.value }))} /><input className={`${field} col-span-2`} placeholder="Display name (optional)" value={newPlayer.displayName} onChange={e => setNewPlayer(x => ({ ...x, displayName: e.target.value }))} /><input className={field} placeholder="Team (e.g. OKC)" value={newPlayer.teamAbbreviation} onChange={e => setNewPlayer(x => ({ ...x, teamAbbreviation: e.target.value }))} /><input className={field} placeholder="Position" value={newPlayer.position} onChange={e => setNewPlayer(x => ({ ...x, position: e.target.value }))} /></div><button className={`${secondary} mt-4`} disabled={!newPlayer.firstName.trim() || !newPlayer.lastName.trim() || createPlayer.isPending} onClick={() => createPlayer.mutate()}>{createPlayer.isPending ? 'Creating…' : 'Create canonical player'}</button></details>
      <details className="mt-6 border-t border-white/10 pt-5"><summary className="cursor-pointer text-sm font-bold text-violet-300">Merge duplicate player records</summary><p className="mt-2 text-xs text-slate-500">The duplicate's name becomes an alias, its references move to the correct player, and future imports match correctly.</p><input className={field} placeholder="Search for both player records" value={mergeSearch} onChange={event => setMergeSearch(event.target.value)} /><label className="mt-3 block text-xs font-semibold text-slate-400">Duplicate to remove<select className={field} value={duplicatePlayerId} onChange={event => setDuplicatePlayerId(event.target.value)}><option value="">Select duplicate</option>{mergePlayers.data?.map(player => <option key={player.id} value={player.id}>{player.name}{player.team ? ` · ${player.team}` : ''}</option>)}</select></label><label className="mt-3 block text-xs font-semibold text-slate-400">Correct player to keep<select className={field} value={targetPlayerId} onChange={event => setTargetPlayerId(event.target.value)}><option value="">Select correct player</option>{mergePlayers.data?.map(player => <option key={player.id} value={player.id}>{player.name}{player.team ? ` · ${player.team}` : ''}</option>)}</select></label><button className={`${secondary} mt-4`} disabled={!duplicatePlayerId || !targetPlayerId || duplicatePlayerId === targetPlayerId || merge.isPending} onClick={() => merge.mutate()}>{merge.isPending ? 'Merging…' : 'Merge into correct player'}</button></details>
    </div>
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[.025]"><div className="border-b border-white/10 p-5"><h2 className="text-xl font-black">Alias library</h2><p className="mt-1 text-sm text-slate-500">{aliases.data?.length ?? 0} saved aliases</p></div>{aliases.isLoading ? <p className="p-5 text-slate-400">Loading aliases…</p> : !aliases.data?.length ? <p className="p-8 text-center text-sm text-slate-400">No aliases yet. Canonical full names still match automatically.</p> : <div className="max-h-[520px] divide-y divide-white/10 overflow-y-auto">{aliases.data.map(alias => <div key={alias.id} className="flex items-center justify-between gap-4 px-5 py-3"><div><strong>{alias.name}</strong><p className="text-xs text-slate-500">matches {alias.playerName}</p></div><button className="text-xs font-semibold text-slate-500 hover:text-rose-300" onClick={() => remove.mutate(alias.id)}>Remove</button></div>)}</div>}</div>
  </div>
}

function Label({ text, children }: { text: string; children: React.ReactNode }) { return <label><span className="text-sm font-semibold text-slate-300">{text}</span>{children}</label> }
function emptyDraft(platformId: string): DraftInput { return { name: '', sportName: 'Basketball', platformId, leagueId: null, status: 'Scheduled', scheduledAtUtc: null, startedAtUtc: null, completedAtUtc: null, entrantCount: 12, draftSlot: null, roundCount: 16, buyIn: 0, finishingPlace: null, winnings: null, notes: null } }
function toRequest(value: DraftInput & { id?: string }) { const request = { ...value }; delete request.id; return request }
function nullableNumber(value: string) { return value === '' ? null : Number(value) }
function toLocal(value: string | null) { if (!value) return ''; const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) }
function signedMoney(value: number) { return `${value > 0 ? '+' : ''}${money(value)}` }
function tone(value: number | null | undefined) { return value == null || value === 0 ? undefined : value > 0 ? 'positive' as const : 'negative' as const }
function displayStatus(value: DraftStatus) { return value === 'InProgress' ? 'In progress' : value }
function ordinal(value: number) { const mod100 = value % 100; const suffix = mod100 >= 11 && mod100 <= 13 ? 'th' : value % 10 === 1 ? 'st' : value % 10 === 2 ? 'nd' : value % 10 === 3 ? 'rd' : 'th'; return `${value}${suffix}` }
function sourceLabel(kind: FantasySource['kind']) { return kind === 'adp' ? 'ADP' : kind === 'projection' ? 'Projections' : 'Rankings' }
function downloadSource(source: FantasySource) { const url = URL.createObjectURL(new Blob([source.raw], { type: 'text/plain;charset=utf-8' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${source.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'fantasy-source'}.txt`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1_000) }
