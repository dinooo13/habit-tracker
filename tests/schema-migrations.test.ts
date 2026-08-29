import { describe, expect, it } from 'vitest'
import {
  assertMigrationRegistryInvariants,
  MAX_MIGRATION_STEPS,
  runMigrationChain,
  type MigrationStep,
} from '~/utils/persistence/schema-migrations'

// A trivial step that tags the payload with the versions it spanned, so a
// multi-step walk can assert both the order and that each step ran.
function tagStep(from: number): MigrationStep {
  return {
    id: `${from}->${from + 1}`,
    from,
    to: from + 1,
    migrate: (payload) => {
      const tags = Array.isArray((payload as { tags?: unknown }).tags)
        ? (payload as { tags: string[] }).tags
        : []
      return { tags: [...tags, `${from}->${from + 1}`] }
    },
  }
}

function registryFrom(steps: MigrationStep[]): Map<number, MigrationStep> {
  return new Map(steps.map(step => [step.from, step]))
}

describe('runMigrationChain', () => {
  const chain = registryFrom([tagStep(1), tagStep(2), tagStep(3)])

  it('walks a multi-step chain in order, applying every step', () => {
    const result = runMigrationChain({ tags: [] }, 1, 4, chain)

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(result.steps).toEqual(['1->2', '2->3', '3->4'])
    expect((result.payload as { tags: string[] }).tags).toEqual(['1->2', '2->3', '3->4'])
  })

  it('is a no-op at (or past) the target version', () => {
    const payload = { tags: ['x'] }
    const result = runMigrationChain(payload, 4, 4, chain)

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(result.steps).toEqual([])
    // Same reference back — nothing was applied.
    expect(result.payload).toBe(payload)
  })

  it('ends the chain cleanly when a step is missing (no throw, no loop)', () => {
    // Hole at version 2: 1->2 exists, 2->3 does not.
    const holed = registryFrom([tagStep(1), tagStep(3)])
    const result = runMigrationChain({ tags: [] }, 1, 4, holed)

    expect(result.ok).toBe(false)
    if (result.ok) {
      return
    }
    expect(result.failedStepId).toBeNull()
  })

  it('captures a throwing step instead of propagating it', () => {
    const boom = new Error('bad v2 envelope')
    const throwing: MigrationStep = {
      id: '2->3',
      from: 2,
      to: 3,
      migrate: () => {
        throw boom
      },
    }
    const result = runMigrationChain({ tags: [] }, 1, 4, registryFrom([tagStep(1), throwing, tagStep(3)]))

    expect(result.ok).toBe(false)
    if (result.ok) {
      return
    }
    expect(result.failedStepId).toBe('2->3')
    expect(result.error).toBe(boom)
  })

  it('bails out via the runtime step cap on a cyclic registry rather than hanging', () => {
    // A deliberately malformed, cyclic registry (bypasses the invariant assert):
    // 1->2 and 2->1 bounce forever. The cap must stop it.
    const cyclic = new Map<number, MigrationStep>([
      [1, { id: 'a', from: 1, to: 2, migrate: p => p }],
      [2, { id: 'b', from: 2, to: 1, migrate: p => p }],
    ])
    const result = runMigrationChain({}, 1, 5, cyclic)

    expect(result.ok).toBe(false)
    if (result.ok) {
      return
    }
    expect(result.failedStepId).toBeNull()
  })

  it('the cap is bounded by MAX_MIGRATION_STEPS', () => {
    expect(MAX_MIGRATION_STEPS).toBeGreaterThan(1)
  })
})

describe('assertMigrationRegistryInvariants', () => {
  it('accepts an empty registry', () => {
    expect(() => assertMigrationRegistryInvariants(new Map())).not.toThrow()
  })

  it('accepts a contiguous single-successor chain', () => {
    expect(() => assertMigrationRegistryInvariants(registryFrom([tagStep(1), tagStep(2), tagStep(3)]))).not.toThrow()
  })

  it('rejects a key that disagrees with step.from', () => {
    const bad = new Map<number, MigrationStep>([[5, tagStep(1)]])
    expect(() => assertMigrationRegistryInvariants(bad)).toThrow()
  })

  it('rejects a step that advances by more than one version', () => {
    const bad = new Map<number, MigrationStep>([[1, { id: '1->3', from: 1, to: 3, migrate: p => p }]])
    expect(() => assertMigrationRegistryInvariants(bad)).toThrow()
  })

  it('rejects a non-contiguous chain (a hole between steps)', () => {
    expect(() => assertMigrationRegistryInvariants(registryFrom([tagStep(1), tagStep(3)]))).toThrow()
  })
})
