import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { BetCalendarResponse } from './types'
import { money } from './types'
import { aggregateByLocalSettleDate, calendarDates, localDateKey, monthRange } from './calendar'

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function ProfitLossCalendar() {
  const [expanded, setExpanded] = useState(() => localStorage.getItem('betting-calendar-expanded') === 'true')
  const [month, setMonth] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1) })
  useEffect(() => { localStorage.setItem('betting-calendar-expanded', String(expanded)) }, [expanded])
  const range = useMemo(() => monthRange(month), [month])
  const queryString = useMemo(() => new URLSearchParams(range).toString(), [range])
  const calendar = useQuery({
    queryKey: ['betting', 'calendar', queryString],
    queryFn: () => api<BetCalendarResponse>(`/api/betting/calendar?${queryString}`),
  })
  const days = useMemo(() => aggregateByLocalSettleDate(calendar.data?.entries ?? []), [calendar.data])
  const dates = useMemo(() => calendarDates(month), [month])
  const entries = calendar.data?.entries ?? []
  const monthProfitLoss = entries.reduce((total, entry) => total + entry.profitLoss, 0)
  const currency = entries[0]?.currencyCode ?? 'USD'
  const winningDays = [...days.values()].filter(day => day.profitLoss > 0).length
  const losingDays = [...days.values()].filter(day => day.profitLoss < 0).length
  const now = new Date()
  const isCurrentMonth = month.getFullYear() === now.getFullYear() && month.getMonth() === now.getMonth()

  function moveMonth(amount: number) {
    setMonth(current => new Date(current.getFullYear(), current.getMonth() + amount, 1))
  }

  return <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-white/[.035] sm:mt-8">
    <div className={`flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:p-4 ${expanded ? 'border-b border-white/10' : ''}`}>
      <button type="button" className="group flex min-w-0 flex-1 items-center justify-between gap-4 rounded-xl px-1 py-1 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300" aria-expanded={expanded} aria-controls="betting-profit-loss-calendar" onClick={() => setExpanded(current => !current)}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-300">Daily P&amp;L</p>
            <h2 className="text-base font-black sm:text-lg">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
            {!calendar.isLoading && !calendar.error && <strong className={`tabular-nums ${monthProfitLoss > 0 ? 'text-emerald-300' : monthProfitLoss < 0 ? 'text-rose-300' : 'text-slate-400'}`}>{signedMoney(monthProfitLoss, currency)}</strong>}
          </div>
          <p className="mt-1 truncate text-xs text-slate-500">{calendar.isLoading ? 'Loading this month’s results…' : calendar.error ? 'Monthly results unavailable' : `${entries.length} settled ${entries.length === 1 ? 'bet' : 'bets'} this month${expanded ? ` · ${winningDays} winning / ${losingDays} losing days` : ''}`}</p>
        </div>
        <span className="flex shrink-0 items-center gap-2 text-xs font-semibold text-slate-400 group-hover:text-white"><span className="hidden sm:inline">{expanded ? 'Hide calendar' : 'View calendar'}</span><span className={`text-lg transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true">⌄</span></span>
      </button>
      {expanded && <div className="flex items-center gap-2 self-end sm:self-auto">
        <button type="button" aria-label="Previous month" className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-bold text-slate-300 hover:bg-white/10 hover:text-white" onClick={() => moveMonth(-1)}>‹</button>
        {!isCurrentMonth && <button type="button" className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white" onClick={() => setMonth(new Date(now.getFullYear(), now.getMonth(), 1))}>Today</button>}
        <button type="button" aria-label="Next month" className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-bold text-slate-300 hover:bg-white/10 hover:text-white" onClick={() => moveMonth(1)}>›</button>
      </div>}
    </div>

    {expanded && <div id="betting-profit-loss-calendar">
      <p className="border-b border-white/10 bg-black/[.06] px-4 py-2 text-xs text-slate-500">Profit and loss by local settle date, including archived history.</p>
      <div className="grid grid-cols-7 border-b border-white/10 bg-black/10 px-2 sm:px-4">
        {weekdays.map(day => <div key={day} className="py-2 text-center text-[9px] font-bold uppercase tracking-wider text-slate-600 sm:text-[11px]">{day}</div>)}
      </div>

      {calendar.isLoading ? <div className="grid grid-cols-7 gap-px bg-white/[.04] p-px">{Array.from({ length: 35 }, (_, index) => <div key={index} className="h-16 animate-pulse bg-white/[.025] sm:h-24" />)}</div>
        : calendar.error ? <p className="p-6 text-center text-sm text-rose-200">Could not load the P&amp;L calendar: {calendar.error.message}</p>
        : <div className="grid grid-cols-7 gap-px bg-white/[.07]">
          {dates.map((date, index) => {
            if (!date) return <div key={`empty-${index}`} className="min-h-16 bg-[#0a1422]/70 sm:min-h-24" aria-hidden="true" />
            const key = localDateKey(date)
            const day = days.get(key)
            const isToday = key === localDateKey(now)
            const tone = !day ? 'bg-[#0d1828]' : day.profitLoss > 0 ? 'bg-emerald-400/[.075]' : day.profitLoss < 0 ? 'bg-rose-400/[.075]' : 'bg-slate-400/[.045]'
            const title = day ? `${day.betCount} settled ${day.betCount === 1 ? 'bet' : 'bets'} · ${signedMoney(day.profitLoss, currency)}` : 'No settled bets'
            return <div key={key} title={title} className={`relative min-h-16 p-1.5 sm:min-h-24 sm:p-3 ${tone}`}>
              <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full text-[10px] font-semibold sm:h-6 sm:min-w-6 sm:text-xs ${isToday ? 'bg-emerald-300 text-emerald-950' : 'text-slate-400'}`}>{date.getDate()}</span>
              {day && <div className="mt-1 sm:mt-3"><p className={`whitespace-nowrap text-[8px] font-black tracking-tight tabular-nums sm:text-sm sm:tracking-normal ${day.profitLoss > 0 ? 'text-emerald-300' : day.profitLoss < 0 ? 'text-rose-300' : 'text-slate-400'}`}><span className="sm:hidden">{signedMobileMoney(day.profitLoss, currency)}</span><span className="hidden sm:inline">{signedCompactMoney(day.profitLoss, currency)}</span></p><p className="mt-0.5 hidden text-[10px] text-slate-600 sm:block">{day.betCount} {day.betCount === 1 ? 'bet' : 'bets'}</p></div>}
            </div>
          })}
        </div>}
    </div>}
  </section>
}

function signedMoney(value: number, currency: string) {
  return `${value > 0 ? '+' : ''}${money(value, currency)}`
}

function signedCompactMoney(value: number, currency: string) {
  const formatted = new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value)
  return `${value > 0 ? '+' : ''}${formatted}`
}

function signedMobileMoney(value: number, currency: string) {
  const absolute = Math.abs(value)
  const formatted = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    notation: absolute >= 1_000 ? 'compact' : 'standard',
    minimumFractionDigits: 0,
    maximumFractionDigits: absolute >= 10 ? 0 : 1,
  }).format(value)
  return `${value > 0 ? '+' : ''}${formatted}`
}
