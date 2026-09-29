import { describe, expect, it } from 'vitest'
import { ensureActiveRoom, initialState, newRoom, newRoomFromDefaults, rememberDraftDefaults } from '../public/on-the-clock/engine.js'

describe('archived draft rooms', () => {
  it('selects another visible room when the active room is archived', () => {
    const state = initialState()
    const visible = newRoom('Underdog')
    state.rooms.push(visible)
    state.rooms[0].archived = true

    ensureActiveRoom(state)

    expect(state.active).toBe(visible.id)
  })

  it('creates a fresh room when every saved room is archived', () => {
    const state = initialState()
    state.rooms[0].archived = true

    ensureActiveRoom(state)

    expect(state.rooms).toHaveLength(2)
    expect(state.rooms.find(room => room.id === state.active)?.archived).not.toBe(true)
  })

  it('carries the latest projection setup into a new draft and prefers imported rankings', () => {
    const state = initialState()
    const current = state.rooms[0]
    const importedRanking = { ...state.sources[0], id: 'my-rankings', name: 'My rankings', demo: false }
    state.sources.push(importedRanking)
    current.projections.gpPenalty = 37
    current.projections.scoring.PTS = 1.25
    current.config.guidance.spread = 22
    rememberDraftDefaults(state, current)

    const next = newRoomFromDefaults(state, 'Underdog', current)

    expect(next.projections.gpPenalty).toBe(37)
    expect(next.projections.scoring.PTS).toBe(1.25)
    expect(next.config.guidance.spread).toBe(22)
    expect(next.rankSource).toBe(importedRanking.id)
  })

  it('uses the explicitly requested platform even when the current room is for another platform', () => {
    const state = initialState()
    const draftKingsRoom = newRoom('DraftKings')
    state.rooms.push(draftKingsRoom)
    state.active = draftKingsRoom.id

    const next = newRoomFromDefaults(state, 'Underdog', draftKingsRoom)

    expect(next.platform).toBe('Underdog')
    expect(next.name).toBe('Underdog draft')
  })
})
