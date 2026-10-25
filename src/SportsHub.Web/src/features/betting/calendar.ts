import type { BetCalendarEntry } from './types'

export type DailyProfitLoss = { profitLoss: number; betCount: number }

export function localDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function monthRange(month: Date) {
  const from = new Date(month.getFullYear(), month.getMonth(), 1)
  const to = new Date(month.getFullYear(), month.getMonth() + 1, 1)
  return { fromUtc: from.toISOString(), toUtc: to.toISOString() }
}

export function aggregateByLocalSettleDate(entries: BetCalendarEntry[]) {
  const days = new Map<string, DailyProfitLoss>()
  for (const entry of entries) {
    const key = localDateKey(new Date(entry.settledAtUtc))
    const current = days.get(key) ?? { profitLoss: 0, betCount: 0 }
    days.set(key, { profitLoss: current.profitLoss + entry.profitLoss, betCount: current.betCount + 1 })
  }
  return days
}

export function calendarDates(month: Date) {
  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const firstWeekday = new Date(year, monthIndex, 1).getDay()
  const dayCount = new Date(year, monthIndex + 1, 0).getDate()
  const cellCount = Math.ceil((firstWeekday + dayCount) / 7) * 7

  return Array.from({ length: cellCount }, (_, index) => {
    const day = index - firstWeekday + 1
    return day >= 1 && day <= dayCount ? new Date(year, monthIndex, day) : null
  })
}
