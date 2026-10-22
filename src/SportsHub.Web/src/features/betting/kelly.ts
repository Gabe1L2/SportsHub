export type KellyOutcome = {
  correctLegs: number
  probability: number
  payoutMultiple: number
}

export type KellyCalculation = {
  fullKellyFraction: number
  adjustedKellyFraction: number
  suggestedWager: number
  outcomes: KellyOutcome[]
}

export type KellyPayoutTier = {
  requiredCorrectLegs: number
  finalPayoutAmount: number
}

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value))

function combinations(total: number, selected: number) {
  const smallerSide = Math.min(selected, total - selected)
  let result = 1
  for (let index = 1; index <= smallerSide; index += 1)
    result = result * (total - smallerSide + index) / index
  return result
}

export function binomialProbability(total: number, correct: number, perLegProbability: number) {
  if (!Number.isInteger(total) || !Number.isInteger(correct) || total < 0 || correct < 0 || correct > total) return 0
  if (perLegProbability === 0) return correct === 0 ? 1 : 0
  if (perLegProbability === 1) return correct === total ? 1 : 0
  if (!Number.isFinite(perLegProbability) || perLegProbability < 0 || perLegProbability > 1) return 0
  return combinations(total, correct)
    * perLegProbability ** correct
    * (1 - perLegProbability) ** (total - correct)
}

export function optimalKellyFraction(outcomes: Pick<KellyOutcome, 'probability' | 'payoutMultiple'>[]) {
  if (outcomes.length === 0 || outcomes.some(outcome => !Number.isFinite(outcome.probability) || !Number.isFinite(outcome.payoutMultiple) || outcome.probability < 0 || outcome.payoutMultiple < 0)) return 0

  const derivative = (fraction: number) => outcomes.reduce((sum, outcome) => {
    const netReturn = outcome.payoutMultiple - 1
    const denominator = 1 + fraction * netReturn
    if (denominator <= 0) return Number.NEGATIVE_INFINITY
    return sum + outcome.probability * netReturn / denominator
  }, 0)

  if (derivative(0) <= 0) return 0

  const maximum = 1 - 1e-12
  if (derivative(maximum) >= 0) return 1

  let low = 0
  let high = maximum
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const middle = (low + high) / 2
    if (derivative(middle) > 0) low = middle
    else high = middle
  }
  return (low + high) / 2
}

function finishCalculation(outcomes: KellyOutcome[], bankroll: number, multiplier: number): KellyCalculation {
  const fullKellyFraction = optimalKellyFraction(outcomes)
  const adjustedKellyFraction = clamp(fullKellyFraction * multiplier, 0, 1)
  const suggestedWager = fullKellyFraction <= 0 || !Number.isFinite(bankroll) || bankroll <= 0
    ? 0
    : Math.round(bankroll * adjustedKellyFraction * 100) / 100
  return { fullKellyFraction, adjustedKellyFraction, suggestedWager, outcomes }
}

export function calculateAllOrNothingKelly(winProbability: number, decimalOdds: number, bankroll: number, multiplier: number) {
  if (!Number.isFinite(winProbability) || winProbability < 0 || winProbability > 1 || !Number.isFinite(decimalOdds) || decimalOdds <= 0)
    return null
  const outcomes: KellyOutcome[] = [
    { correctLegs: 0, probability: 1 - winProbability, payoutMultiple: 0 },
    { correctLegs: 1, probability: winProbability, payoutMultiple: decimalOdds },
  ]
  return finishCalculation(outcomes, bankroll, multiplier)
}

export function calculateFlexKelly(legCount: number, perLegProbability: number, entryValue: number, tiers: KellyPayoutTier[], bankroll: number, multiplier: number) {
  if (!Number.isInteger(legCount) || legCount < 1 || !Number.isFinite(perLegProbability) || perLegProbability < 0 || perLegProbability > 1 || !Number.isFinite(entryValue) || entryValue <= 0)
    return null

  const payoutByCorrectLegs = new Map<number, number>()
  for (const tier of tiers) {
    if (!Number.isInteger(tier.requiredCorrectLegs) || tier.requiredCorrectLegs < 0 || tier.requiredCorrectLegs > legCount || !Number.isFinite(tier.finalPayoutAmount) || tier.finalPayoutAmount < 0)
      return null
    if (payoutByCorrectLegs.has(tier.requiredCorrectLegs)) return null
    payoutByCorrectLegs.set(tier.requiredCorrectLegs, tier.finalPayoutAmount)
  }

  const outcomes = Array.from({ length: legCount + 1 }, (_, correctLegs): KellyOutcome => ({
    correctLegs,
    probability: binomialProbability(legCount, correctLegs, perLegProbability),
    payoutMultiple: (payoutByCorrectLegs.get(correctLegs) ?? 0) / entryValue,
  }))
  return finishCalculation(outcomes, bankroll, multiplier)
}
