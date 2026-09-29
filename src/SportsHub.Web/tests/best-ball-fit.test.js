import { describe, expect, it } from 'vitest'
import { allocate, allocateBestBallLineup } from '../public/on-the-clock/engine.js'
import { lookAhead } from '../public/on-the-clock/lookahead.js'

const player = (id, pos, rank) => ({ id, name: id, pos: [pos], rank, consensusRank: rank, adjusted: 101-rank, adp: rank })

describe('Underdog weekly lineup fit', () => {
  it('recognizes that 3 guards and 2 forwards still need a center, not another guard', () => {
    const roster = [player('g1','G',1),player('g2','G',2),player('g3','G',3),player('f1','F',4),player('f2','F',5)]
    expect(allocateBestBallLineup(roster).filled).toBe(5)
    expect(allocateBestBallLineup([...roster,player('g4','G',6)]).filled).toBe(5)
    expect(allocateBestBallLineup([...roster,player('c1','C',6)]).filled).toBe(6)
  })

  it('boosts a top-five center over redundant depth around the sixth roster pick', () => {
    const roster = [player('g1','G',1),player('g2','G',2),player('g3','G',3),player('f1','F',4),player('f2','F',5)]
    const guard = player('guard','G',1),center = player('center','C',5),pool = [guard,center,...roster,player('last-ranked','F',100)]
    const targets = { G: 5, F: 5, C: 3 }
    const result = lookAhead({ pool, available: [guard,center], roster, fit: allocate(roster,targets), lineupFit: allocateBestBallLineup(roster), room: { platform: 'Underdog', orderMode: 'ranking', config: { targets, guidance: { spread: 20, needBonus: 2 } }, picks: [] }, pick: 1, myPick: null, following: null, allocate, allocateBestBallLineup })
    expect(result.candidates[0].id).toBe(center.id)
    expect(result.candidates.find(candidate=>candidate.id===center.id).lineupGain).toBe(1)
    expect(result.candidates.find(candidate=>candidate.id===guard.id).lineupGain).toBe(0)
  })
})
