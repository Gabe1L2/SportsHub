import { describe, expect, it } from 'vitest'
import { ensureActiveRoom, poolFor } from '../public/on-the-clock/engine.js'
import { replaceSource } from '../public/on-the-clock/source-actions.js'

const player = (adp) => ({ id: 'jalenjohnson', name: 'Jalen Johnson', rank: null, adp, pos: ['F'], posRaw: 'F', team: 'ATL' })

describe('source replacement', () => {
  it('activates a replacement ADP in every draft that used the prior version', () => {
    const ranking = { id: 'rankings', kind: 'ranking', platform: 'All', raw: '', players: [{ ...player(20.2), rank: 10 }] }
    const oldAdp = { id: 'old-adp', kind: 'adp', platform: 'Underdog', raw: '', players: [player(20.2)] }
    const replacement = { id: 'new-adp', kind: 'adp', platform: 'Underdog', raw: '', players: [player(8.3)] }
    const room = { name: 'Current', platform: 'Underdog', rankSource: ranking.id, adpSource: oldAdp.id, aliases: {}, orderMode: 'ranking', picks: [], projections: { weights: {} } }
    const otherRoom = { ...structuredClone(room), name: 'Other draft' }
    const state = { sources: [ranking, oldAdp], rooms: [room, otherRoom], draftDefaults: { Underdog: { adpSource: oldAdp.id } } }

    replaceSource(state, room, oldAdp.id, replacement)

    expect(room.adpSource).toBe(replacement.id)
    expect(otherRoom.adpSource).toBe(replacement.id)
    expect(state.draftDefaults.Underdog.adpSource).toBe(replacement.id)
    expect(poolFor(state, room)[0].adp).toBe(8.3)
    expect(oldAdp.archived).toBe(true)
  })

  it('repairs a saved draft that still points at an archived ADP version', () => {
    const ranking = { id: 'rankings', kind: 'ranking', platform: 'All', raw: '', players: [{ ...player(20.2), rank: 10 }] }
    const oldAdp = { id: 'old-adp', kind: 'adp', platform: 'Underdog', raw: '', archived: true, players: [player(20.2)] }
    const replacement = { id: 'new-adp', kind: 'adp', platform: 'Underdog', raw: '', replaces: oldAdp.id, players: [player(8.3)] }
    const room = { id: 'room', name: 'Draft', platform: 'Underdog', rankSource: ranking.id, adpSource: oldAdp.id, aliases: {}, orderMode: 'ranking', picks: [], projections: { weights: {} } }
    const state = { active: room.id, sources: [ranking, oldAdp, replacement], rooms: [room] }

    ensureActiveRoom(state)

    expect(room.adpSource).toBe(replacement.id)
    expect(poolFor(state, room)[0].adp).toBe(8.3)
  })
})
