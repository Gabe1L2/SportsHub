export type BetStatus = 'Pending' | 'Won' | 'Lost' | 'Push' | 'Voided' | 'PartiallyWon'
export type BetTiming = 'Pregame' | 'Live'
export type BetPayoutMode = 'AllOrNothing' | 'Flex'
export type PlatformType = 'PickEm' | 'Sportsbook' | 'Exchange' | 'Other'
export type SourceType = 'Self' | 'Tool' | 'Capper' | 'Friend' | 'Other'
export type BonusType = 'PayoutBoost' | 'DiscountPick' | 'FreeEntry' | 'ProtectedEntry' | 'Other'

export type Platform = { id: string; name: string; type: PlatformType; isActive: boolean }
export type BetSource = { id: string; name: string; type: SourceType; isActive: boolean }
export type BettingLookups = { platforms: Platform[]; sources: BetSource[] }
export type PayoutTier = { id?: string; requiredCorrectLegs: number; basePayoutAmount: number; finalPayoutAmount: number }
export type BetBonus = { id?: string; type: BonusType; percentage: number | null; fixedAmount: number | null; description: string | null }

export type Bet = {
  id: string
  platform: Platform
  source: BetSource | null
  bankrollAccountId: string | null
  entryCost: number
  entryValue: number
  legCount: number
  payoutMode: BetPayoutMode
  decimalOdds: number | null
  estimatedProbability: number | null
  timing: BetTiming
  status: BetStatus
  correctLegCount: number | null
  expectedPayout: number | null
  actualPayout: number | null
  profitLoss: number | null
  currencyCode: string
  notes: string | null
  placedAtUtc: string
  settledAtUtc: string | null
  isArchived: boolean
  archivedAtUtc: string | null
  bonus: BetBonus | null
  payoutTiers: PayoutTier[]
}

export type BettingSummary = { totalBets: number; pendingBets: number; totalEntryCost: number; netProfit: number; roi: number | null }
export type BetListResponse = { summary: BettingSummary; items: Bet[]; totalCount: number; page: number; pageSize: number }

export type PayoutTierInput = { requiredCorrectLegs: number; basePayoutAmount: number | null; finalPayoutAmount: number }
export type BetInput = {
  platformId: string
  sourceId: string | null
  bankrollAccountId: string | null
  entryCost: number
  entryValue: number
  legCount: number
  payoutMode: BetPayoutMode
  decimalOdds: number | null
  estimatedProbability: number | null
  timing: BetTiming
  placedAtUtc: string
  currencyCode: string
  notes: string | null
  bonus: Omit<BetBonus, 'id'> | null
  payoutTiers: PayoutTierInput[]
}

export const money = (value: number | null | undefined, currency = 'USD') => value == null ? '—' : new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value)
export const percent = (value: number | null | undefined) => value == null ? '—' : `${(value * 100).toFixed(1)}%`
export const decimalToAmerican = (decimal: number) => decimal >= 2 ? Math.round((decimal - 1) * 100) : Math.round(-100 / (decimal - 1))
export const americanToDecimal = (american: number) => american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american)
export const displayEnum = (value: string) => value.replace(/([a-z])([A-Z])/g, '$1 $2')
