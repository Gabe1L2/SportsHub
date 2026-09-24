import { describe, expect, it } from 'vitest'
import { ApiError } from './api'

describe('ApiError', () => {
  it('retains the HTTP status and message', () => {
    const error = new ApiError(403, 'Forbidden')
    expect(error.status).toBe(403)
    expect(error.message).toBe('Forbidden')
  })
})
