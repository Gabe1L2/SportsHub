import { describe, expect, it } from 'vitest'
import { initialState, newRoom, validateBackup } from '../public/on-the-clock/engine.js'

describe('workspace validation', () => {
  it('accepts canonical database IDs in picks and watch lists', () => {
    const state = initialState()
    const canonicalId = '12345678-1234-4123-8123-123456789abc'
    const sourcePlayer = state.sources[0].players[0]
    state.rooms[0].picks.push({ pick: 1, team: 1, player: { ...sourcePlayer, id: canonicalId, canonicalPlayerId: canonicalId } })
    state.rooms[0].watch.push(canonicalId)

    expect(validateBackup(state)).toBe(state)
  })

  it('accepts Sleeper and Custom draft rooms and sources', () => {
    const state = initialState()
    state.sources.push({ ...state.sources[0], id: 'sleeper-rankings', platform: 'Sleeper' })
    state.rooms.push(newRoom('Sleeper', 'sleeper-rankings'), newRoom('Custom'))

    expect(validateBackup(state)).toBe(state)
  })
})
