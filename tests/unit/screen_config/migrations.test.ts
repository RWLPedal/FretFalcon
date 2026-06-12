import { describe, it, expect } from 'vitest'
import { migrate, MigrationError, FutureVersionError } from '../../../ts/screen_config/migrations'
import { CURRENT_SCREEN_CONFIG_VERSION } from '../../../ts/screen_config/screen_config_types'

const CURRENT = CURRENT_SCREEN_CONFIG_VERSION // 3

// ─── V3 shape helpers ────────────────────────────────────────────────────────

const emptyV3 = {
  instances: {},
  links: [],
  layout: { floating: { referenceGrid: { cols: 80, rows: 60 }, nextZIndex: 100, perInstance: {} } },
  customTunings: {},
}

describe('migrate — unversioned (V0) blobs', () => {
  it('fills in defaults for an empty object', () => {
    const result = migrate({})
    expect(result).toMatchObject(emptyV3)
  })

  it('preserves referenceGrid and nextZIndex from V0 through migration', () => {
    const v0 = {
      referenceGrid: { cols: 120, rows: 90 },
      nextZIndex: 200,
      openViews: {
        'fv-1': { instanceId: 'fv-1', viewId: 'timer', gridPosition: { col: 2, row: 3 }, zIndex: 201 },
      },
      links: [],
    }
    const result = migrate(v0)
    expect(result.layout?.floating?.referenceGrid).toEqual({ cols: 120, rows: 90 })
    expect(result.layout?.floating?.nextZIndex).toBe(200)
    expect(Object.keys(result.instances!)).toHaveLength(1)
    expect(result.instances!['fv-1'].viewId).toBe('timer')
    expect(result.layout?.floating?.perInstance['fv-1'].gridPosition).toEqual({ col: 2, row: 3 })
    expect(result.layout?.floating?.perInstance['fv-1'].zIndex).toBe(201)
  })

  it('treats null as a V0 blob and throws MigrationError (migration cannot read null fields)', () => {
    expect(() => migrate(null)).toThrow(MigrationError)
  })
})

describe('migrate — V2 → V3', () => {
  it('splits openViews into instances + layout.floating.perInstance', () => {
    const v2Payload = {
      referenceGrid: { cols: 113, rows: 64 },
      nextZIndex: 120,
      openViews: {
        'fv-1': {
          instanceId: 'fv-1',
          viewId: 'configurable_instrument_feature',
          gridPosition: { col: 17, row: 1 },
          gridSize: { cols: 48, rows: 23 },
          zIndex: 118,
          viewState: { featureTypeName: 'Scale', config: ['Major', 'G'] },
          orientationOverride: 'horizontal' as const,
          zoomActive: true,
        },
        'fv-2': {
          instanceId: 'fv-2',
          viewId: 'floating_timer',
          gridPosition: { col: 70, row: 1 },
          zIndex: 119,
          viewState: { duration: 300 },
        },
      },
      links: [{ id: 'link-1', sourceInstanceId: 'fv-1', sourceHandle: 'right', targetInstanceId: 'fv-2', targetHandle: 'left' }],
      customTunings: { Guitar: [{ name: 'Drop D', notes: [52, 57, 62, 67, 71, 76] }] },
    }

    const result = migrate({ version: 2, payload: v2Payload })

    // instances should have layout-independent fields only
    expect(result.instances['fv-1']).toEqual({
      instanceId: 'fv-1',
      viewId: 'configurable_instrument_feature',
      viewState: { featureTypeName: 'Scale', config: ['Major', 'G'] },
      collapsed: undefined,
      orientationOverride: 'horizontal',
      zoomActive: true,
    })
    expect(result.instances['fv-2'].viewId).toBe('floating_timer')

    // layout.floating should have grid data
    expect(result.layout?.floating?.referenceGrid).toEqual({ cols: 113, rows: 64 })
    expect(result.layout?.floating?.nextZIndex).toBe(120)
    expect(result.layout?.floating?.perInstance['fv-1']).toEqual({
      gridPosition: { col: 17, row: 1 },
      gridSize: { cols: 48, rows: 23 },
      zIndex: 118,
    })
    expect(result.layout?.floating?.perInstance['fv-2']).toEqual({
      gridPosition: { col: 70, row: 1 },
      gridSize: undefined,
      zIndex: 119,
    })

    // links and customTunings pass through
    expect(result.links).toHaveLength(1)
    expect(result.customTunings).toEqual({ Guitar: [{ name: 'Drop D', notes: [52, 57, 62, 67, 71, 76] }] })
  })

  it('handles empty openViews', () => {
    const v2Empty = {
      referenceGrid: { cols: 80, rows: 60 },
      nextZIndex: 100,
      openViews: {},
      links: [],
      customTunings: {},
    }
    const result = migrate({ version: 2, payload: v2Empty })
    expect(Object.keys(result.instances)).toHaveLength(0)
    expect(result.layout?.floating?.perInstance).toEqual({})
  })
})

describe('migrate — versioned envelopes', () => {
  it('passes through a current-version (V3) payload unchanged', () => {
    const payload = {
      instances: { 'fv-1': { instanceId: 'fv-1', viewId: 'timer', viewState: null } },
      links: [],
      layout: { floating: { referenceGrid: { cols: 80, rows: 60 }, nextZIndex: 100, perInstance: {} } },
      customTunings: { Guitar: [{ name: 'Drop D', notes: [52, 57, 62, 67, 71, 76] }] },
    }
    expect(migrate({ version: CURRENT, payload })).toEqual(payload)
  })

  it('migrates a V1 envelope to V3 (V1→V2→V3)', () => {
    const v1Payload = {
      referenceGrid: { cols: 80, rows: 60 },
      openViews: {},
      nextZIndex: 100,
      links: [],
    }
    const result = migrate({ version: 1, payload: v1Payload })
    // Should end up as V3
    expect(result.instances).toBeDefined()
    expect(result.layout?.floating?.referenceGrid).toEqual({ cols: 80, rows: 60 })
    expect(result.customTunings).toEqual({})
  })

  it('migrates a V0 envelope (version: 0) through the full chain', () => {
    const result = migrate({ version: 0, payload: {} })
    expect(result.instances).toBeDefined()
    expect(result.links).toEqual([])
    expect(result.layout?.floating).toBeDefined()
  })
})

describe('migrate — FutureVersionError', () => {
  it('throws FutureVersionError when version exceeds current', () => {
    expect(() => migrate({ version: CURRENT + 1, payload: {} })).toThrow(FutureVersionError)
  })

  it('FutureVersionError carries the found version number', () => {
    const futureVersion = CURRENT + 5
    try {
      migrate({ version: futureVersion, payload: {} })
      expect.fail('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(FutureVersionError)
      expect((e as FutureVersionError).foundVersion).toBe(futureVersion)
    }
  })

  it('does not throw for version exactly equal to current', () => {
    expect(() => migrate({ version: CURRENT, payload: { instances: {}, links: [], layout: {} } })).not.toThrow()
  })
})
