import { describe, expect, it } from 'vitest'
import { createId } from '~/utils/domain/id'

describe('createId', () => {
  it('prefixes the generated id', () => {
    expect(createId('habit')).toMatch(/^habit_.+/)
    expect(createId('entry')).toMatch(/^entry_.+/)
  })

  it('produces unique ids across many calls', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => createId('habit')))
    expect(ids.size).toBe(1000)
  })
})
