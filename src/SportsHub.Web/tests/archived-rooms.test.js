import { describe, expect, it } from 'vitest'
import { ensureActiveRoom, initialState, newRoom } from '../public/on-the-clock/engine.js'

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
})
