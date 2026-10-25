import { describe, expect, it } from 'vitest'
import { aggregateByLocalSettleDate, calendarDates, localDateKey, monthRange } from './calendar'

describe('betting P&L calendar', () => {
  it('aggregates settled bets onto their local calendar day', () => {
    const settledAt = new Date(2026, 9, 12, 20, 30).toISOString()
    const days = aggregateByLocalSettleDate([
      { id: 'a', settledAtUtc: settledAt, profitLoss: 150, currencyCode: 'USD' },
      { id: 'b', settledAtUtc: settledAt, profitLoss: -50, currencyCode: 'USD' },
    ])

    expect(days.get('2026-10-12')).toEqual({ profitLoss: 100, betCount: 2 })
  })

  it('builds complete Sunday-through-Saturday weeks for a month', () => {
    const dates = calendarDates(new Date(2026, 9, 1))

    expect(dates).toHaveLength(35)
    expect(dates.slice(0, 4)).toEqual([null, null, null, null])
    expect(localDateKey(dates[4]!)).toBe('2026-10-01')
    expect(localDateKey(dates[34]!)).toBe('2026-10-31')
  })

  it('returns local month boundaries as UTC instants', () => {
    const range = monthRange(new Date(2026, 9, 15))

    expect(new Date(range.fromUtc).getTime()).toBe(new Date(2026, 9, 1).getTime())
    expect(new Date(range.toUtc).getTime()).toBe(new Date(2026, 10, 1).getTime())
  })
})
