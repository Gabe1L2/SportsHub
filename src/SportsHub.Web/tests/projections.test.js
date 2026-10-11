import { describe, expect, it } from 'vitest'
import { buildConsensus, projectionDefaults, scoringPreset } from '../public/on-the-clock/projections.js'

const player = (id, canonicalPlayerId, points) => ({
  id,
  canonicalPlayerId,
  name: id === 'dbooker' ? 'D. Booker' : 'Devin Booker',
  rank: null,
  adp: null,
  pos: ['G'],
  posRaw: 'SG',
  team: 'PHX',
  gp: 80,
  stats: { PTS: points },
})

describe('projection source identity', () => {
  it('lets an explicit name match override a mistakenly-created canonical player', () => {
    const sources = [
      { id: 'hashtag', kind: 'projection', players: [player('devinbooker', 'booker', 25)] },
      { id: 'sportsline', kind: 'projection', players: [player('devinbooker', 'booker', 27)] },
      { id: 'espn', kind: 'projection', players: [player('dbooker', 'duplicate-booker', 29)] },
    ]
    const config = projectionDefaults('Underdog')
    config.weights = { hashtag: 100, sportsline: 25, espn: 50 }
    config.gpPenalty = 0
    const room = { platform: 'Underdog', aliases: { espn: { dbooker: 'devinbooker' } }, projections: config }

    const rows = buildConsensus({ sources }, room)

    expect(rows).toHaveLength(1)
    expect(rows[0].sourceCount).toBe(3)
    expect(rows[0].contributions.map(x => x.id)).toEqual(['hashtag', 'sportsline', 'espn'])
  })
})

describe('scoring presets', () => {
  it('keeps platform presets separate from the neutral custom baseline', () => {
    expect(scoringPreset('Underdog')).toMatchObject({ PTS: 1, REB: 1.2, STL: 3, TO: -1, FG3M: 0 })
    expect(scoringPreset('DraftKings')).toMatchObject({ PTS: 1, REB: 1.25, STL: 2, TO: -.5, FG3M: .5, DD: 1.5 })
    expect(scoringPreset('Sleeper')).toMatchObject({ PTS: 1, REB: 0, AST: 0, TO: 0 })
    expect(scoringPreset('Custom')).toEqual(scoringPreset('Sleeper'))
  })
})
