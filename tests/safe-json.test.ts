import { describe, expect, it } from 'vitest'
import { safeJsonParse } from '~/utils/safe-json'

describe('safeJsonParse', () => {
  it('parses normal JSON unchanged', () => {
    expect(safeJsonParse('{"a":1,"b":["x","y"]}')).toEqual({ a: 1, b: ['x', 'y'] })
  })

  it('strips __proto__ without polluting Object.prototype', () => {
    const result = safeJsonParse('{"__proto__":{"polluted":true},"a":2}') as Record<string, unknown>

    expect(result).toEqual({ a: 2 })
    expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(false)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('drops constructor and prototype keys', () => {
    expect(safeJsonParse('{"constructor":{"x":1},"prototype":{"y":2},"ok":3}')).toEqual({ ok: 3 })
  })
})
