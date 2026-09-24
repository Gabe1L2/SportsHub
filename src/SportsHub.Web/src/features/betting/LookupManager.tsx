import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { BetSource, BettingLookups, Platform, PlatformType, SourceType } from './types'
import { displayEnum } from './types'
import { Field, inputClass, Modal, primaryButton, secondaryButton } from './ui'

type Props = { lookups: BettingLookups; canManagePlatforms: boolean; onClose: () => void }
const platformTypes: PlatformType[] = ['PickEm', 'Sportsbook', 'Exchange', 'Other']
const sourceTypes: SourceType[] = ['Self', 'Tool', 'Capper', 'Friend', 'Other']

export function LookupManager({ lookups, canManagePlatforms, onClose }: Props) {
  const client = useQueryClient()
  const [platformName, setPlatformName] = useState(''); const [platformType, setPlatformType] = useState<PlatformType>('PickEm')
  const [sourceName, setSourceName] = useState(''); const [sourceType, setSourceType] = useState<SourceType>('Self')
  const [error, setError] = useState('')
  const refresh = () => client.invalidateQueries({ queryKey: ['betting', 'lookups'] })
  const createPlatform = useMutation({ mutationFn: () => api<Platform>('/api/betting/platforms', { method: 'POST', body: JSON.stringify({ name: platformName, type: platformType, isActive: true }) }), onSuccess: () => { setPlatformName(''); void refresh() } })
  const createSource = useMutation({ mutationFn: () => api<BetSource>('/api/betting/sources', { method: 'POST', body: JSON.stringify({ name: sourceName, type: sourceType, isActive: true }) }), onSuccess: () => { setSourceName(''); void refresh() } })
  const update = useMutation({ mutationFn: ({ kind, item }: { kind: 'platforms' | 'sources'; item: Platform | BetSource }) => api(`/api/betting/${kind}/${item.id}`, { method: 'PUT', body: JSON.stringify({ name: item.name, type: item.type, isActive: item.isActive }) }), onSuccess: () => void refresh() })

  async function addPlatform(event: FormEvent) { event.preventDefault(); setError(''); try { await createPlatform.mutateAsync() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to add platform.') } }
  async function addSource(event: FormEvent) { event.preventDefault(); setError(''); try { await createSource.mutateAsync() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to add source.') } }
  async function toggle(kind: 'platforms' | 'sources', item: Platform | BetSource) { setError(''); try { await update.mutateAsync({ kind, item: { ...item, isActive: !item.isActive } }) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to update item.') } }

  return <Modal title={canManagePlatforms ? 'Platforms & sources' : 'Bet sources'} description={canManagePlatforms ? 'Keep entry choices tidy without losing old records.' : 'Manage the sources attached only to your bets.'} onClose={onClose} wide={canManagePlatforms}>
    <div className="grid gap-6 p-6 lg:grid-cols-2">
      {canManagePlatforms && <section>
        <h3 className="font-bold">Platforms</h3><p className="mt-1 text-xs text-slate-500">Sportsbooks, pick’em apps, and exchanges.</p>
        <form onSubmit={addPlatform} className="mt-4 grid grid-cols-[1fr_1fr_auto] gap-2"><Field label="Name"><input required maxLength={120} className={inputClass} value={platformName} onChange={e => setPlatformName(e.target.value)} /></Field><Field label="Type"><select className={inputClass} value={platformType} onChange={e => setPlatformType(e.target.value as PlatformType)}>{platformTypes.map(x => <option key={x}>{displayEnum(x)}</option>)}</select></Field><button disabled={createPlatform.isPending} className={`${primaryButton} self-end`}>Add</button></form>
        <div className="mt-4 max-h-72 divide-y divide-white/10 overflow-y-auto rounded-xl border border-white/10">{lookups.platforms.map(item => <div key={item.id} className="flex items-center justify-between gap-3 p-3"><div><strong className={item.isActive ? '' : 'text-slate-500'}>{item.name}</strong><span className="ml-2 text-xs text-slate-500">{displayEnum(item.type)}</span></div><button type="button" className="text-xs font-semibold text-slate-400 hover:text-white" onClick={() => void toggle('platforms', item)}>{item.isActive ? 'Disable' : 'Enable'}</button></div>)}</div>
      </section>}
      <section className={canManagePlatforms ? '' : 'lg:col-span-2'}>
        <h3 className="font-bold">Bet sources</h3><p className="mt-1 text-xs text-slate-500">Tools, cappers, friends, or your own systems.</p>
        <form onSubmit={addSource} className="mt-4 grid grid-cols-[1fr_1fr_auto] gap-2"><Field label="Name"><input required maxLength={160} className={inputClass} value={sourceName} onChange={e => setSourceName(e.target.value)} /></Field><Field label="Type"><select className={inputClass} value={sourceType} onChange={e => setSourceType(e.target.value as SourceType)}>{sourceTypes.map(x => <option key={x}>{displayEnum(x)}</option>)}</select></Field><button disabled={createSource.isPending} className={`${primaryButton} self-end`}>Add</button></form>
        <div className="mt-4 max-h-72 divide-y divide-white/10 overflow-y-auto rounded-xl border border-white/10">{lookups.sources.length ? lookups.sources.map(item => <div key={item.id} className="flex items-center justify-between gap-3 p-3"><div><strong className={item.isActive ? '' : 'text-slate-500'}>{item.name}</strong><span className="ml-2 text-xs text-slate-500">{displayEnum(item.type)}</span></div><button type="button" className="text-xs font-semibold text-slate-400 hover:text-white" onClick={() => void toggle('sources', item)}>{item.isActive ? 'Disable' : 'Enable'}</button></div>) : <p className="p-4 text-sm text-slate-500">No saved sources yet.</p>}</div>
      </section>
      {error && <p className="rounded-xl bg-rose-400/10 px-4 py-3 text-sm text-rose-200 lg:col-span-2">{error}</p>}
    </div>
    <div className="flex justify-end border-t border-white/10 px-6 py-5"><button className={secondaryButton} onClick={onClose}>Done</button></div>
  </Modal>
}
