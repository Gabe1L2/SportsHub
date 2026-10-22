import { describe, expect, it } from 'vitest'
import { binomialProbability, calculateAllOrNothingKelly, calculateFlexKelly, optimalKellyFraction, parseProbabilityInput } from './kelly'

describe('Kelly calculator', () => {
  it.each([
    ['42.5', 0.425, 'percentage'],
    ['42.5%', 0.425, 'percentage'],
    ['-120', 120 / 220, 'americanOdds'],
    ['+300', 0.25, 'americanOdds'],
    ['300', 0.25, 'americanOdds'],
    ['100', 1, 'percentage'],
    ['+100', 0.5, 'americanOdds'],
  ])('recognizes probability input %s', (input, expected, kind) => {
    const parsed = parseProbabilityInput(input)

    expect(parsed?.probability).toBeCloseTo(expected as number, 10)
    expect(parsed?.kind).toBe(kind)
  })

  it.each(['', 'not odds', '101%', '+0', '-0'])('rejects invalid probability input %s', input => {
    expect(parseProbabilityInput(input)).toBeNull()
  })

  it('calculates the standard all-or-nothing Kelly fraction', () => {
    const result = calculateAllOrNothingKelly(0.55, 2, 1_000, 0.25)

    expect(result?.fullKellyFraction).toBeCloseTo(0.1, 10)
    expect(result?.adjustedKellyFraction).toBeCloseTo(0.025, 10)
    expect(result?.suggestedWager).toBe(25)
  })

  it('recommends zero when an all-or-nothing bet has no edge', () => {
    const result = calculateAllOrNothingKelly(0.4, 2, 1_000, 1)

    expect(result?.fullKellyFraction).toBe(0)
    expect(result?.suggestedWager).toBe(0)
  })

  it('builds independent flex outcome probabilities and optimizes across every payout', () => {
    const result = calculateFlexKelly(2, 0.36, 10, [
      { requiredCorrectLegs: 1, finalPayoutAmount: 10 },
      { requiredCorrectLegs: 2, finalPayoutAmount: 30 },
    ], 1_000, 0.5)

    expect(result?.perLegProbability).toBeCloseTo(0.6, 10)
    expect(result?.outcomes.map(outcome => outcome.probability)).toEqual([
      expect.closeTo(0.16, 10),
      expect.closeTo(0.48, 10),
      expect.closeTo(0.36, 10),
    ])
    expect(result?.fullKellyFraction).toBeCloseTo(0.5384615385, 9)
    expect(result?.suggestedWager).toBe(269.23)
  })

  it('treats unlisted flex results as a full loss and returns zero for negative value', () => {
    const result = calculateFlexKelly(3, 0.064, 10, [
      { requiredCorrectLegs: 3, finalPayoutAmount: 20 },
    ], 500, 0.25)

    expect(result?.fullKellyFraction).toBe(0)
    expect(result?.suggestedWager).toBe(0)
  })

  it('handles exact zero and one leg probabilities', () => {
    expect(binomialProbability(4, 0, 0)).toBe(1)
    expect(binomialProbability(4, 4, 1)).toBe(1)
    expect(binomialProbability(4, 2, 1)).toBe(0)
  })

  it('rejects invalid outcome inputs', () => {
    expect(optimalKellyFraction([{ probability: 1, payoutMultiple: -1 }])).toBe(0)
  })
})
