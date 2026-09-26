import { useMemo, useState, type FormEvent } from 'react'
import type { Bet, BetInput, BettingLookups, BetPayoutMode, BetTiming, BonusType, PayoutTierInput } from './types'
import { americanToDecimal, decimalToAmerican, displayEnum, money } from './types'
import { Field, inputClass, Modal, primaryButton, secondaryButton } from './ui'

type Props = { bet?: Bet | null; lookups: BettingLookups; saving: boolean; onClose: () => void; onSave: (input: BetInput) => Promise<void> }
type OddsMode = 'american' | 'decimal' | 'payout'
type TierDraft = { requiredCorrectLegs: string; basePayoutAmount: string; finalPayoutAmount: string }

const localDateTime = (value?: string) => {
  const date = value ? new Date(value) : new Date()
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}
const numberOrNull = (value: string) => value.trim() === '' ? null : Number(value)

export function BetForm({ bet, lookups, saving, onClose, onSave }: Props) {
  const originalFullTier = bet?.payoutTiers.find(x => x.requiredCorrectLegs === bet.legCount)
  const [platformId, setPlatformId] = useState(bet?.platform.id ?? lookups.platforms.find(x => x.isActive)?.id ?? '')
  const [sourceId, setSourceId] = useState(bet?.source?.id ?? '')
  const [entryCost, setEntryCost] = useState(String(bet?.entryCost ?? 10))
  const [entryValue, setEntryValue] = useState(String(bet?.entryValue ?? 10))
  const [legCount, setLegCount] = useState(String(bet?.legCount ?? 1))
  const [payoutMode, setPayoutMode] = useState<BetPayoutMode>(bet?.payoutMode ?? 'AllOrNothing')
  const [timing, setTiming] = useState<BetTiming>(bet?.timing ?? 'Pregame')
  const [oddsMode, setOddsMode] = useState<OddsMode>('american')
  const [pricingValue, setPricingValue] = useState(() => bet?.decimalOdds ? String(decimalToAmerican(bet.decimalOdds)) : '')
  const [basePayout, setBasePayout] = useState(String(originalFullTier?.basePayoutAmount ?? ''))
  const [probability, setProbability] = useState(bet?.estimatedProbability == null ? '' : String(bet.estimatedProbability * 100))
  const [placedAt, setPlacedAt] = useState(localDateTime(bet?.placedAtUtc))
  const [currencyCode, setCurrencyCode] = useState(bet?.currencyCode ?? 'USD')
  const [notes, setNotes] = useState(bet?.notes ?? '')
  const [hasBonus, setHasBonus] = useState(Boolean(bet?.bonus))
  const [bonusType, setBonusType] = useState<BonusType>(bet?.bonus?.type ?? 'PayoutBoost')
  const [bonusPercent, setBonusPercent] = useState(bet?.bonus?.percentage == null ? '' : String(bet.bonus.percentage * 100))
  const [bonusAmount, setBonusAmount] = useState(bet?.bonus?.fixedAmount == null ? '' : String(bet.bonus.fixedAmount))
  const [bonusDescription, setBonusDescription] = useState(bet?.bonus?.description ?? '')
  const [tiers, setTiers] = useState<TierDraft[]>(() => bet?.payoutTiers.map(x => ({ requiredCorrectLegs: String(x.requiredCorrectLegs), basePayoutAmount: String(x.basePayoutAmount), finalPayoutAmount: String(x.finalPayoutAmount) })) ?? [])
  const [error, setError] = useState('')

  const entryValueNumber = Number(entryValue) || 0
  const pricing = useMemo(() => {
    const value = Number(pricingValue)
    if (!Number.isFinite(value) || value === 0 || entryValueNumber <= 0) return { decimal: null, payout: null }
    if (oddsMode === 'payout') return { decimal: value / entryValueNumber, payout: value }
    const decimal = oddsMode === 'american' ? americanToDecimal(value) : value
    return decimal > 0 ? { decimal, payout: decimal * entryValueNumber } : { decimal: null, payout: null }
  }, [entryValueNumber, oddsMode, pricingValue])

  function changeLegCount(value: string) {
    setLegCount(value)
    const count = Number(value)
    if (payoutMode === 'Flex' && count > 0 && !tiers.some(x => Number(x.requiredCorrectLegs) === count))
      setTiers(current => [...current, { requiredCorrectLegs: value, basePayoutAmount: '', finalPayoutAmount: '' }])
  }

  function changePayoutMode(value: BetPayoutMode) {
    setPayoutMode(value)
    if (value === 'Flex' && tiers.length === 0) setTiers([{ requiredCorrectLegs: legCount, basePayoutAmount: '', finalPayoutAmount: '' }])
  }

  function updateTier(index: number, key: keyof TierDraft, value: string) {
    setTiers(current => current.map((tier, tierIndex) => tierIndex === index ? { ...tier, [key]: value } : tier))
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setError('')
    const legs = Number(legCount); const cost = Number(entryCost); const value = Number(entryValue)
    if (!platformId) return setError('Create or select a platform first.')
    if (!Number.isFinite(cost) || cost < 0 || !Number.isFinite(value) || value <= 0) return setError('Enter valid entry cost and entry value amounts.')
    if (!Number.isInteger(legs) || legs < 1) return setError('Number of legs must be at least one.')

    let payoutTiers: PayoutTierInput[]
    let decimalOdds: number | null
    if (payoutMode === 'AllOrNothing') {
      if (pricing.decimal == null || pricing.payout == null || pricing.payout < 0) return setError('Enter valid odds or a payout amount.')
      decimalOdds = pricing.decimal
      payoutTiers = [{ requiredCorrectLegs: legs, basePayoutAmount: numberOrNull(basePayout) ?? pricing.payout, finalPayoutAmount: pricing.payout }]
    } else {
      payoutTiers = tiers.map(tier => ({ requiredCorrectLegs: Number(tier.requiredCorrectLegs), basePayoutAmount: numberOrNull(tier.basePayoutAmount), finalPayoutAmount: Number(tier.finalPayoutAmount) }))
      if (payoutTiers.length === 0 || payoutTiers.some(x => !Number.isInteger(x.requiredCorrectLegs) || !Number.isFinite(x.finalPayoutAmount) || x.finalPayoutAmount < 0)) return setError('Complete every flex payout row.')
      const full = payoutTiers.find(x => x.requiredCorrectLegs === legs)
      if (!full) return setError(`Add a payout tier for all ${legs} legs being correct.`)
      decimalOdds = full.finalPayoutAmount / value
    }

    try {
      await onSave({
        platformId, sourceId: sourceId || null,
        entryCost: cost, entryValue: value, legCount: legs, payoutMode, decimalOdds,
        estimatedProbability: probability === '' ? null : Number(probability) / 100,
        timing, placedAtUtc: new Date(placedAt).toISOString(), currencyCode: currencyCode.toUpperCase(), notes: notes.trim() || null,
        bonus: hasBonus ? { type: bonusType, percentage: bonusPercent === '' ? null : Number(bonusPercent) / 100, fixedAmount: numberOrNull(bonusAmount), description: bonusDescription.trim() || null } : null,
        payoutTiers,
      })
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save this bet.') }
  }

  const activePlatforms = lookups.platforms.filter(x => x.isActive || x.id === platformId)
  const activeSources = lookups.sources.filter(x => x.isActive || x.id === sourceId)
  return <Modal title={bet ? 'Edit bet' : 'Add a bet'} description="Record the entry as it was offered so your reporting stays accurate." onClose={onClose} wide>
    <form onSubmit={submit}>
      <div className="grid gap-6 p-6 lg:grid-cols-2">
        <section className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-[.18em] text-emerald-300">Entry details</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Platform"><select required className={inputClass} value={platformId} onChange={e => setPlatformId(e.target.value)}><option value="">Select platform</option>{activePlatforms.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
            <Field label="Source" hint="Leave blank when it is your own play."><select className={inputClass} value={sourceId} onChange={e => setSourceId(e.target.value)}><option value="">Myself / no saved source</option>{activeSources.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
            <Field label="Cash paid" hint="Use 0 for a free entry."><input required min="0" step="0.01" type="number" className={inputClass} value={entryCost} onChange={e => setEntryCost(e.target.value)} /></Field>
            <Field label="Entry value" hint="The nominal value used to calculate odds."><input required min="0.01" step="0.01" type="number" className={inputClass} value={entryValue} onChange={e => setEntryValue(e.target.value)} /></Field>
            <Field label="Number of legs"><input required min="1" max="100" type="number" className={inputClass} value={legCount} onChange={e => changeLegCount(e.target.value)} /></Field>
            <Field label="When placed"><input required type="datetime-local" className={inputClass} value={placedAt} onChange={e => setPlacedAt(e.target.value)} /></Field>
            <Field label="Bet timing"><div className="mt-1.5 grid grid-cols-2 rounded-xl border border-white/15 bg-slate-950/70 p-1">{(['Pregame', 'Live'] as BetTiming[]).map(value => <button key={value} type="button" onClick={() => setTiming(value)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${timing === value ? 'bg-emerald-400 text-emerald-950' : 'text-slate-400'}`}>{value}</button>)}</div></Field>
            <Field label="Currency"><input maxLength={3} className={inputClass} value={currencyCode} onChange={e => setCurrencyCode(e.target.value)} /></Field>
          </div>
          <Field label="Your estimated hit probability" hint="Optional. Enter a percentage such as 42.5."><div className="relative"><input min="0" max="100" step="0.01" type="number" className={`${inputClass} pr-9`} value={probability} onChange={e => setProbability(e.target.value)} /><span className="absolute right-3 top-4 text-sm text-slate-500">%</span></div></Field>
          <Field label="Notes"><textarea rows={3} maxLength={2000} className={inputClass} placeholder="What made this bet interesting?" value={notes} onChange={e => setNotes(e.target.value)} /></Field>
        </section>

        <section className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-[.18em] text-emerald-300">Payout structure</h3>
          <div className="grid grid-cols-2 rounded-xl border border-white/15 bg-slate-950/70 p-1">{(['AllOrNothing', 'Flex'] as BetPayoutMode[]).map(value => <button key={value} type="button" onClick={() => changePayoutMode(value)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${payoutMode === value ? 'bg-emerald-400 text-emerald-950' : 'text-slate-400'}`}>{value === 'AllOrNothing' ? 'All or nothing' : 'Flex payout'}</button>)}</div>
          {payoutMode === 'AllOrNothing' ? <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4">
            <div className="flex flex-wrap gap-2">{(['american', 'decimal', 'payout'] as OddsMode[]).map(value => <button key={value} type="button" onClick={() => { const currentDecimal = pricing.decimal; setOddsMode(value); if (currentDecimal) setPricingValue(value === 'american' ? String(decimalToAmerican(currentDecimal)) : value === 'decimal' ? currentDecimal.toFixed(4) : (currentDecimal * entryValueNumber).toFixed(2)) }} className={`rounded-lg px-3 py-1.5 text-xs font-bold capitalize ${oddsMode === value ? 'bg-white text-slate-950' : 'bg-white/5 text-slate-400'}`}>{value}</button>)}</div>
            <Field label={oddsMode === 'american' ? 'American odds' : oddsMode === 'decimal' ? 'Decimal odds' : 'Total payout'} className="mt-4"><input required step={oddsMode === 'american' ? '1' : '0.01'} type="number" className={inputClass} placeholder={oddsMode === 'american' ? '-110 or +150' : '0.00'} value={pricingValue} onChange={e => setPricingValue(e.target.value)} /></Field>
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-emerald-400/10 p-3 text-sm"><div><span className="block text-xs text-emerald-200/60">Decimal odds</span><strong>{pricing.decimal?.toFixed(3) ?? '—'}</strong></div><div><span className="block text-xs text-emerald-200/60">Total payout</span><strong>{money(pricing.payout, currencyCode)}</strong></div></div>
            {hasBonus && <Field label="Base payout before bonus" hint="Optional; final payout above is what you expect to receive." className="mt-4"><input min="0" step="0.01" type="number" className={inputClass} value={basePayout} onChange={e => setBasePayout(e.target.value)} /></Field>}
          </div> : <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[.025] p-4">
            <div className="grid grid-cols-[.8fr_1fr_1fr_auto] gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500"><span>Correct</span><span>Base payout</span><span>Final payout</span><span /></div>
            {tiers.map((tier, index) => <div key={index} className="grid grid-cols-[.8fr_1fr_1fr_auto] gap-2"><input aria-label="Correct legs" min="0" max={legCount} type="number" className={inputClass.replace('mt-1.5 ', '')} value={tier.requiredCorrectLegs} onChange={e => updateTier(index, 'requiredCorrectLegs', e.target.value)} /><input aria-label="Base payout" min="0" step="0.01" type="number" className={inputClass.replace('mt-1.5 ', '')} value={tier.basePayoutAmount} onChange={e => updateTier(index, 'basePayoutAmount', e.target.value)} placeholder="Optional" /><input aria-label="Final payout" required min="0" step="0.01" type="number" className={inputClass.replace('mt-1.5 ', '')} value={tier.finalPayoutAmount} onChange={e => updateTier(index, 'finalPayoutAmount', e.target.value)} /><button aria-label="Remove payout tier" type="button" onClick={() => setTiers(current => current.filter((_, tierIndex) => tierIndex !== index))} className="rounded-lg px-2 text-slate-500 hover:bg-rose-400/10 hover:text-rose-300">×</button></div>)}
            <button type="button" className={secondaryButton} onClick={() => setTiers(current => [...current, { requiredCorrectLegs: legCount, basePayoutAmount: '', finalPayoutAmount: '' }])}>+ Add payout tier</button>
            <p className="text-xs text-slate-500">Enter the total returned at each result. Base payout is optional unless you want to preserve the pre-bonus amount.</p>
          </div>}

          <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-white/10 bg-white/[.025] p-4"><span><strong className="block text-sm">Bonus applied</strong><span className="text-xs text-slate-500">Payout boost, free entry, discount pick, or protection</span></span><input type="checkbox" className="size-5 accent-emerald-400" checked={hasBonus} onChange={e => setHasBonus(e.target.checked)} /></label>
          {hasBonus && <div className="grid gap-4 rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-4 sm:grid-cols-2">
            <Field label="Bonus type"><select className={inputClass} value={bonusType} onChange={e => setBonusType(e.target.value as BonusType)}>{(['PayoutBoost', 'DiscountPick', 'FreeEntry', 'ProtectedEntry', 'Other'] as BonusType[]).map(x => <option key={x} value={x}>{displayEnum(x)}</option>)}</select></Field>
            <Field label="Percentage"><div className="relative"><input min="0" step="0.01" type="number" className={`${inputClass} pr-9`} value={bonusPercent} onChange={e => setBonusPercent(e.target.value)} /><span className="absolute right-3 top-4 text-sm text-slate-500">%</span></div></Field>
            <Field label="Fixed value"><input min="0" step="0.01" type="number" className={inputClass} value={bonusAmount} onChange={e => setBonusAmount(e.target.value)} /></Field>
            <Field label="Description"><input maxLength={1000} className={inputClass} placeholder="Optional details" value={bonusDescription} onChange={e => setBonusDescription(e.target.value)} /></Field>
          </div>}
        </section>
      </div>
      {error && <p className="mx-6 mb-2 rounded-xl bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</p>}
      <div className="flex justify-end gap-3 border-t border-white/10 px-6 py-5"><button type="button" className={secondaryButton} onClick={onClose}>Cancel</button><button disabled={saving} className={primaryButton}>{saving ? 'Saving…' : bet ? 'Save changes' : 'Add bet'}</button></div>
    </form>
  </Modal>
}
