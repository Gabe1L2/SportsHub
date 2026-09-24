import { useMemo, useState, type FormEvent } from 'react'
import type { Bet, BetStatus } from './types'
import { displayEnum, money } from './types'
import { Field, inputClass, Modal, primaryButton, secondaryButton } from './ui'

type Settlement = { status: BetStatus; actualPayout: number; correctLegCount: number | null; settledAtUtc: string }
type Props = { bet: Bet; saving: boolean; onClose: () => void; onSave: (settlement: Settlement) => Promise<void> }

const localNow = () => { const date = new Date(); return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) }

export function SettleDialog({ bet, saving, onClose, onSave }: Props) {
  const [status, setStatus] = useState<BetStatus>(bet.status === 'Pending' ? 'Won' : bet.status)
  const [correctLegs, setCorrectLegs] = useState(String(bet.correctLegCount ?? bet.legCount))
  const suggested = useMemo(() => bet.payoutTiers.find(x => x.requiredCorrectLegs === Number(correctLegs))?.finalPayoutAmount, [bet.payoutTiers, correctLegs])
  const [actualPayout, setActualPayout] = useState(String(bet.actualPayout ?? suggested ?? bet.expectedPayout ?? 0))
  const [settledAt, setSettledAt] = useState(localNow())
  const [error, setError] = useState('')

  function changeStatus(value: BetStatus) {
    setStatus(value)
    if (value === 'Lost') { setCorrectLegs('0'); setActualPayout('0') }
    if (value === 'Push' || value === 'Voided') setActualPayout(String(bet.entryCost))
    if (value === 'Won') { setCorrectLegs(String(bet.legCount)); setActualPayout(String(bet.expectedPayout ?? 0)) }
  }
  function changeCorrectLegs(value: string) {
    setCorrectLegs(value)
    const tier = bet.payoutTiers.find(x => x.requiredCorrectLegs === Number(value))
    if (tier) setActualPayout(String(tier.finalPayoutAmount))
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('')
    const payout = Number(actualPayout); const legs = correctLegs === '' ? null : Number(correctLegs)
    if (!Number.isFinite(payout) || payout < 0) return setError('Actual payout cannot be negative.')
    try { await onSave({ status, actualPayout: payout, correctLegCount: legs, settledAtUtc: new Date(settledAt).toISOString() }) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to settle this bet.') }
  }

  return <Modal title="Settle bet" description={`${bet.platform.name} · ${bet.legCount} ${bet.legCount === 1 ? 'leg' : 'legs'} · ${money(bet.entryCost, bet.currencyCode)} paid`} onClose={onClose}>
    <form onSubmit={submit}>
      <div className="space-y-5 p-6">
        <Field label="Result"><select className={inputClass} value={status} onChange={e => changeStatus(e.target.value as BetStatus)}>{(['Won', 'Lost', 'PartiallyWon', 'Push', 'Voided'] as BetStatus[]).map(x => <option key={x} value={x}>{displayEnum(x)}</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Correct legs"><input min="0" max={bet.legCount} type="number" className={inputClass} value={correctLegs} onChange={e => changeCorrectLegs(e.target.value)} /></Field>
          <Field label="Actual total payout"><input required min="0" step="0.01" type="number" className={inputClass} value={actualPayout} onChange={e => setActualPayout(e.target.value)} /></Field>
        </div>
        <Field label="Settled at"><input required type="datetime-local" className={inputClass} value={settledAt} onChange={e => setSettledAt(e.target.value)} /></Field>
        {suggested != null && <p className="rounded-xl bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">Recorded payout for {correctLegs} correct: <strong>{money(suggested, bet.currencyCode)}</strong></p>}
        {error && <p className="rounded-xl bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</p>}
      </div>
      <div className="flex justify-end gap-3 border-t border-white/10 px-6 py-5"><button type="button" className={secondaryButton} onClick={onClose}>Cancel</button><button disabled={saving} className={primaryButton}>{saving ? 'Saving…' : 'Save result'}</button></div>
    </form>
  </Modal>
}
