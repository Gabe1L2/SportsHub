import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { BankrollTransaction, BankrollTransactionType, BettingFinance, BettingLookups, BettingToolExpense } from './types'
import { displayEnum, money } from './types'
import { Field, inputClass, Modal, primaryButton, secondaryButton } from './ui'

const localDateTime = (value?: string) => {
  const date = value ? new Date(value) : new Date()
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}
const message = (reason: unknown, fallback: string) => reason instanceof Error ? reason.message : fallback

export function BettingFinanceManager({ lookups, onClose }: { lookups: BettingLookups; onClose: () => void }) {
  const client = useQueryClient()
  const finance = useQuery({ queryKey: ['betting', 'finance'], queryFn: () => api<BettingFinance>('/api/betting/finance') })
  const refresh = () => client.invalidateQueries({ queryKey: ['betting'] })
  const [section, setSection] = useState<'bankroll' | 'tools'>('bankroll')
  const [error, setError] = useState('')
  const removeTransaction = useMutation({ mutationFn: (id: string) => api<void>(`/api/betting/finance/transactions/${id}`, { method: 'DELETE' }), onSuccess: () => void refresh() })
  const removeExpense = useMutation({ mutationFn: (id: string) => api<void>(`/api/betting/finance/tool-expenses/${id}`, { method: 'DELETE' }), onSuccess: () => void refresh() })

  async function deleteTransaction(item: BankrollTransaction) {
    const label = item.type === 'Adjustment' ? 'this reconciliation adjustment' : `this ${item.type.toLowerCase()}`
    if (!window.confirm(`Delete ${label}? The bankroll total will be recalculated.`)) return
    setError(''); try { await removeTransaction.mutateAsync(item.id) } catch (reason) { setError(message(reason, 'Unable to delete the transaction.')) }
  }
  async function deleteExpense(item: BettingToolExpense) {
    if (!window.confirm(`Delete the ${item.toolName} expense?`)) return
    setError(''); try { await removeExpense.mutateAsync(item.id) } catch (reason) { setError(message(reason, 'Unable to delete the expense.')) }
  }

  const summary = finance.data?.summary
  return <Modal title="Bankroll & costs" description="Track cash movement, reconcile your real balance, and include tools in all-in profit." onClose={onClose} wide>
    <div className="p-4 sm:p-6">
      {finance.isLoading ? <div className="h-48 animate-pulse rounded-2xl bg-white/5" /> : finance.error ? <p className="rounded-xl bg-rose-400/10 p-4 text-sm text-rose-200">{finance.error.message}</p> : <>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <FinanceStat label="Current bankroll" value={money(summary?.currentBankroll)} tone="positive" />
          <FinanceStat label="Bet profit" value={money(summary?.betProfit)} />
          <FinanceStat label="Tool costs" value={money(summary?.totalToolCosts)} tone="negative" />
          <FinanceStat label="Profit after tools" value={money(summary?.overallProfitAfterTools)} tone={(summary?.overallProfitAfterTools ?? 0) >= 0 ? 'positive' : 'negative'} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-white/10 bg-white/[.025] p-3 text-center text-xs text-slate-400">
          <div><span className="block text-slate-500">Deposited</span><strong className="text-sm text-slate-200">{money(summary?.totalDeposits)}</strong></div>
          <div><span className="block text-slate-500">Withdrawn</span><strong className="text-sm text-slate-200">{money(summary?.totalWithdrawals)}</strong></div>
          <div><span className="block text-slate-500">Adjustments</span><strong className="text-sm text-slate-200">{money(summary?.totalAdjustments)}</strong></div>
        </div>
        <div className="mt-5 flex rounded-xl border border-white/10 bg-slate-950/40 p-1">
          <button className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold ${section === 'bankroll' ? 'bg-white/10 text-white' : 'text-slate-500'}`} onClick={() => setSection('bankroll')}>Cash & bankroll</button>
          <button className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold ${section === 'tools' ? 'bg-white/10 text-white' : 'text-slate-500'}`} onClick={() => setSection('tools')}>Tool expenses</button>
        </div>
        {section === 'bankroll' ? <BankrollSection lookups={lookups} finance={finance.data!} onRefresh={refresh} onError={setError} onDelete={deleteTransaction} /> : <ToolExpenseSection finance={finance.data!} onRefresh={refresh} onError={setError} onDelete={deleteExpense} />}
      </>}
      {error && <p className="mt-4 rounded-xl bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</p>}
    </div>
    <div className="flex justify-end border-t border-white/10 px-6 py-5"><button className={secondaryButton} onClick={onClose}>Done</button></div>
  </Modal>
}

function BankrollSection({ lookups, finance, onRefresh, onError, onDelete }: { lookups: BettingLookups; finance: BettingFinance; onRefresh: () => void; onError: (value: string) => void; onDelete: (item: BankrollTransaction) => void }) {
  const [editing, setEditing] = useState<BankrollTransaction | null>(null)
  const [type, setType] = useState<Exclude<BankrollTransactionType, 'Adjustment'>>('Deposit')
  const [platformId, setPlatformId] = useState(lookups.platforms.find(x => x.isActive)?.id ?? '')
  const [amount, setAmount] = useState('')
  const [occurredAt, setOccurredAt] = useState(localDateTime())
  const [note, setNote] = useState('')
  const [targetBalance, setTargetBalance] = useState(String(finance.summary.currentBankroll.toFixed(2)))
  const [adjustmentNote, setAdjustmentNote] = useState('')
  const [adjustmentDate, setAdjustmentDate] = useState(localDateTime())
  useEffect(() => setTargetBalance(String(finance.summary.currentBankroll.toFixed(2))), [finance.summary.currentBankroll])
  const saveTransaction = useMutation({ mutationFn: () => api<BankrollTransaction>(editing ? `/api/betting/finance/transactions/${editing.id}` : '/api/betting/finance/transactions', { method: editing ? 'PUT' : 'POST', body: JSON.stringify({ platformId, type, amount: Number(amount), occurredAtUtc: new Date(occurredAt).toISOString(), note: note.trim() || null }) }), onSuccess: () => { reset(); void onRefresh() } })
  const reconcile = useMutation({ mutationFn: () => api<BankrollTransaction>('/api/betting/finance/reconcile', { method: 'POST', body: JSON.stringify({ targetBalance: Number(targetBalance), occurredAtUtc: new Date(adjustmentDate).toISOString(), note: adjustmentNote.trim() || null }) }), onSuccess: () => { setAdjustmentNote(''); void onRefresh() } })

  function reset() { setEditing(null); setType('Deposit'); setAmount(''); setNote(''); setOccurredAt(localDateTime()) }
  function edit(item: BankrollTransaction) { if (item.type === 'Adjustment') return; setEditing(item); setType(item.type); setPlatformId(item.platform?.id ?? ''); setAmount(String(Math.abs(item.amount))); setOccurredAt(localDateTime(item.occurredAtUtc)); setNote(item.note ?? '') }
  async function submit(event: FormEvent) { event.preventDefault(); onError(''); if (!platformId || Number(amount) <= 0) return onError('Select a platform and enter an amount greater than zero.'); try { await saveTransaction.mutateAsync() } catch (reason) { onError(message(reason, 'Unable to save the transaction.')) } }
  async function submitReconciliation(event: FormEvent) { event.preventDefault(); onError(''); if (!Number.isFinite(Number(targetBalance))) return onError('Enter the bankroll currently held across all platforms.'); try { await reconcile.mutateAsync() } catch (reason) { onError(message(reason, 'Unable to reconcile the bankroll.')) } }
  const difference = useMemo(() => Number(targetBalance) - finance.summary.currentBankroll, [targetBalance, finance.summary.currentBankroll])

  return <div className="mt-5 space-y-5">
    <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
      <form onSubmit={submit} className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><h3 className="font-bold">{editing ? 'Edit cash transaction' : 'Add deposit or withdrawal'}</h3><div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4"><Field label="Type"><select className={inputClass} value={type} onChange={e => setType(e.target.value as typeof type)}><option value="Deposit">Deposit</option><option value="Withdrawal">Withdrawal</option></select></Field><Field label="Platform"><select required className={inputClass} value={platformId} onChange={e => setPlatformId(e.target.value)}><option value="">Select</option>{lookups.platforms.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field><Field label="Amount"><input required min="0.01" step="0.01" type="number" className={inputClass} value={amount} onChange={e => setAmount(e.target.value)} /></Field><Field label="Date"><input required type="datetime-local" className={inputClass} value={occurredAt} onChange={e => setOccurredAt(e.target.value)} /></Field></div><Field label="Notes" className="mt-3"><input maxLength={500} className={inputClass} value={note} onChange={e => setNote(e.target.value)} placeholder="Optional" /></Field><div className="mt-4 flex justify-end gap-2">{editing && <button type="button" className={secondaryButton} onClick={reset}>Cancel edit</button>}<button disabled={saveTransaction.isPending} className={primaryButton}>{saveTransaction.isPending ? 'Saving…' : editing ? 'Save changes' : 'Add transaction'}</button></div></form>
      <form onSubmit={submitReconciliation} className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[.045] p-4"><h3 className="font-bold">Reconcile current bankroll</h3><p className="mt-1 text-xs text-slate-500">Enter the actual total held across every platform. The difference is saved as an adjustment.</p><div className="mt-3 grid grid-cols-2 gap-3"><Field label="Actual bankroll"><input required step="0.01" type="number" className={inputClass} value={targetBalance} onChange={e => setTargetBalance(e.target.value)} /></Field><Field label="Date"><input required type="datetime-local" className={inputClass} value={adjustmentDate} onChange={e => setAdjustmentDate(e.target.value)} /></Field></div><Field label="Reason" className="mt-3"><input maxLength={500} className={inputClass} value={adjustmentNote} onChange={e => setAdjustmentNote(e.target.value)} placeholder="Optional reconciliation note" /></Field><div className="mt-4 flex items-center justify-between gap-3"><span className={`text-sm font-semibold ${difference >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>Adjustment: {difference >= 0 ? '+' : ''}{money(difference)}</span><button disabled={reconcile.isPending || difference === 0} className={primaryButton}>{reconcile.isPending ? 'Saving…' : 'Reconcile'}</button></div></form>
    </div>
    <History title={`Cash history (${finance.transactionCount.toLocaleString()})`} empty="No deposits, withdrawals, or adjustments yet.">{finance.transactions.map(item => {
      const signedAmount = item.type === 'Withdrawal' ? -Math.abs(item.amount) : item.type === 'Deposit' ? Math.abs(item.amount) : item.amount
      return <div key={item.id} className="grid gap-2 px-3 py-3 text-sm sm:grid-cols-[120px_1fr_100px_1.2fr_auto] sm:items-center"><span className="text-xs text-slate-500">{new Date(item.occurredAtUtc).toLocaleDateString()}</span><span><strong>{item.type === 'Adjustment' ? 'Reconciliation' : item.platform?.name}</strong><span className="ml-2 text-xs text-slate-500">{displayEnum(item.type)}</span></span><strong className={signedAmount >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{signedAmount >= 0 ? '+' : ''}{money(signedAmount)}</strong><span className="truncate text-xs text-slate-500" title={item.note ?? ''}>{item.type === 'Adjustment' && item.targetBalance != null ? `Set to ${money(item.targetBalance)}${item.note ? ` · ${item.note}` : ''}` : item.note || '—'}</span><span className="flex gap-2 text-xs">{item.type !== 'Adjustment' && <button className="font-semibold text-slate-300" onClick={() => edit(item)}>Edit</button>}<button className="font-semibold text-rose-300/80" onClick={() => void onDelete(item)}>Delete</button></span></div>
    })}</History>
  </div>
}

function ToolExpenseSection({ finance, onRefresh, onError, onDelete }: { finance: BettingFinance; onRefresh: () => void; onError: (value: string) => void; onDelete: (item: BettingToolExpense) => void }) {
  const [editing, setEditing] = useState<BettingToolExpense | null>(null); const [toolName, setToolName] = useState(''); const [amount, setAmount] = useState(''); const [incurredAt, setIncurredAt] = useState(localDateTime()); const [note, setNote] = useState('')
  const save = useMutation({ mutationFn: () => api<BettingToolExpense>(editing ? `/api/betting/finance/tool-expenses/${editing.id}` : '/api/betting/finance/tool-expenses', { method: editing ? 'PUT' : 'POST', body: JSON.stringify({ toolName, amount: Number(amount), incurredAtUtc: new Date(incurredAt).toISOString(), note: note.trim() || null }) }), onSuccess: () => { reset(); void onRefresh() } })
  function reset() { setEditing(null); setToolName(''); setAmount(''); setNote(''); setIncurredAt(localDateTime()) }
  function edit(item: BettingToolExpense) { setEditing(item); setToolName(item.toolName); setAmount(String(item.amount)); setIncurredAt(localDateTime(item.incurredAtUtc)); setNote(item.note ?? '') }
  async function submit(event: FormEvent) { event.preventDefault(); onError(''); if (!toolName.trim() || Number(amount) <= 0) return onError('Enter a tool name and an amount greater than zero.'); try { await save.mutateAsync() } catch (reason) { onError(message(reason, 'Unable to save the tool expense.')) } }
  return <div className="mt-5 space-y-5"><form onSubmit={submit} className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><h3 className="font-bold">{editing ? 'Edit tool expense' : 'Add tool expense'}</h3><p className="mt-1 text-xs text-slate-500">One-time history only. This does not create a recurring subscription.</p><div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3"><Field label="Tool or service"><input required maxLength={160} className={inputClass} value={toolName} onChange={e => setToolName(e.target.value)} placeholder="OddsJam" /></Field><Field label="Amount"><input required min="0.01" step="0.01" type="number" className={inputClass} value={amount} onChange={e => setAmount(e.target.value)} /></Field><Field label="Date"><input required type="datetime-local" className={inputClass} value={incurredAt} onChange={e => setIncurredAt(e.target.value)} /></Field></div><Field label="Notes" className="mt-3"><input maxLength={500} className={inputClass} value={note} onChange={e => setNote(e.target.value)} placeholder="Optional" /></Field><div className="mt-4 flex justify-end gap-2">{editing && <button type="button" className={secondaryButton} onClick={reset}>Cancel edit</button>}<button disabled={save.isPending} className={primaryButton}>{save.isPending ? 'Saving…' : editing ? 'Save changes' : 'Add expense'}</button></div></form><History title={`Tool expense history (${finance.toolExpenseCount.toLocaleString()})`} empty="No tool expenses yet.">{finance.toolExpenses.map(item => <div key={item.id} className="grid gap-2 px-3 py-3 text-sm sm:grid-cols-[120px_1fr_110px_1.2fr_auto] sm:items-center"><span className="text-xs text-slate-500">{new Date(item.incurredAtUtc).toLocaleDateString()}</span><strong>{item.toolName}</strong><strong className="text-rose-300">{money(item.amount)}</strong><span className="truncate text-xs text-slate-500" title={item.note ?? ''}>{item.note || '—'}</span><span className="flex gap-2 text-xs"><button className="font-semibold text-slate-300" onClick={() => edit(item)}>Edit</button><button className="font-semibold text-rose-300/80" onClick={() => void onDelete(item)}>Delete</button></span></div>)}</History></div>
}

function FinanceStat({ label, value, tone }: { label: string; value: string; tone?: 'positive' | 'negative' }) { return <div className="rounded-xl border border-white/10 bg-white/[.04] p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p><p className={`mt-1 text-xl font-black ${tone === 'positive' ? 'text-emerald-300' : tone === 'negative' ? 'text-rose-300' : 'text-white'}`}>{value}</p></div> }
function History({ title, empty, children }: { title: string; empty: string; children: ReactNode }) { const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children); return <section className="overflow-hidden rounded-2xl border border-white/10"><h3 className="border-b border-white/10 bg-white/[.035] px-4 py-3 text-sm font-bold">{title}</h3><div className="max-h-72 divide-y divide-white/[.06] overflow-y-auto">{hasChildren ? children : <p className="p-5 text-sm text-slate-500">{empty}</p>}</div></section> }
