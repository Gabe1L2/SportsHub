import { describe, expect, it } from 'vitest'
import { buildConsensus, projectionDefaults } from '../public/on-the-clock/projections.js'

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
