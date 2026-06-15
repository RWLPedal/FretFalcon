import { describe, it, expect } from 'vitest'
import { migrate, MigrationError, FutureVersionError } from '../../../ts/screen_config/migrations'
import { CURRENT_SCREEN_CONFIG_VERSION } from '../../../ts/screen_config/screen_config_types'
import { GRID_COLS, ROW_PX } from '../../../ts/panels/grid_constants'

const CURRENT = CURRENT_SCREEN_CONFIG_VERSION // 4

// ─── V4 shape helpers ────────────────────────────────────────────────────────

const emptyV4 = {
  instances: {},
  links: [],
  layout: { floating: { gridCols: GRID_COLS, rowPx: ROW_PX, nextZIndex: 100, perInstance: {} } },
  customTunings: {},
}

describe('migrate — unversioned (V0) blobs', () => {
  it('fills in defaults for an empty object', () => {
    const result = migrate({})
    expect(result).toMatchObject(emptyV4)
  })

  it('preserves nextZIndex from V0 payload through migration chain', () => {
    const v0 = {
      referenceGrid: { cols: 120, rows: 90 },
      nextZIndex: 200,
      openViews: {
        'fv-1': { instanceId: 'fv-1', viewId: 'timer', gridPosition: { col: 2, row: 3 }, zIndex: 201 },
      },
      links: [],
    }
    const result = migrate(v0)
    // Instances survive
    expect(Object.keys(result.instances!)).toHaveLength(1)
    expect(result.instances!['fv-1'].viewId).toBe('timer')
    // V4 floating layout: positions reset, but nextZIndex preserved
    expect(result.layout?.floating?.gridCols).toBe(GRID_COLS)
    expect(result.layout?.floating?.rowPx).toBe(ROW_PX)
    expect(result.layout?.floating?.nextZIndex).toBe(200)
    expect(result.layout?.floating?.perInstance).toEqual({})
    // referenceGrid is dropped in V4
    expect((result.layout?.floating as any)?.referenceGrid).toBeUndefined()
  })

  it('treats null as a V0 blob and throws MigrationError (migration cannot read null fields)', () => {
    expect(() => migrate(null)).toThrow(MigrationError)
  })
})

describe('migrate — V2 → V4 (full chain)', () => {
  it('instances and links survive V2→V4; positions are reset', () => {
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

    // V4 layout: positions reset, schema changed
    expect(result.layout?.floating?.gridCols).toBe(GRID_COLS)
    expect(result.layout?.floating?.rowPx).toBe(ROW_PX)
    expect(result.layout?.floating?.nextZIndex).toBe(120)
    expect(result.layout?.floating?.perInstance).toEqual({})

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

describe('migrate — V3 → V4', () => {
  it('resets floating positions but preserves instances, links, tabbed, customTunings', () => {
    const v3Payload = {
      instances: { 'fv-1': { instanceId: 'fv-1', viewId: 'timer', viewState: null } },
      links: [{ id: 'link-1', sourceInstanceId: 'fv-1', sourceHandle: 'right', targetInstanceId: 'fv-2', targetHandle: 'left' }],
      layout: {
        floating: { referenceGrid: { cols: 80, rows: 60 }, nextZIndex: 130, perInstance: {
          'fv-1': { gridPosition: { col: 10, row: 5 }, gridSize: { cols: 20, rows: 15 }, zIndex: 110 },
        } },
        tabbed: { order: ['fv-1'], activeId: 'fv-1' },
      },
      customTunings: { Guitar: [] },
    }

    const result = migrate({ version: 3, payload: v3Payload })

    expect(result.instances['fv-1'].viewId).toBe('timer')
    expect(result.links).toHaveLength(1)
    expect(result.layout?.tabbed).toEqual({ order: ['fv-1'], activeId: 'fv-1' })
    expect(result.customTunings).toEqual({ Guitar: [] })

    // Floating positions reset
    expect(result.layout?.floating?.gridCols).toBe(GRID_COLS)
    expect(result.layout?.floating?.rowPx).toBe(ROW_PX)
    expect(result.layout?.floating?.nextZIndex).toBe(130)
    expect(result.layout?.floating?.perInstance).toEqual({})
    // Old referenceGrid key gone
    expect((result.layout?.floating as any)?.referenceGrid).toBeUndefined()
  })
})

describe('migrate — versioned envelopes', () => {
  it('passes through a current-version (V4) payload unchanged', () => {
    const payload = {
      instances: { 'fv-1': { instanceId: 'fv-1', viewId: 'timer', viewState: null } },
      links: [],
      layout: { floating: { gridCols: GRID_COLS, rowPx: ROW_PX, nextZIndex: 100, perInstance: {} } },
      customTunings: { Guitar: [{ name: 'Drop D', notes: [52, 57, 62, 67, 71, 76] }] },
    }
    expect(migrate({ version: CURRENT, payload })).toEqual(payload)
  })

  it('migrates a V1 envelope to V4 (V1→V2→V3→V4)', () => {
    const v1Payload = {
      referenceGrid: { cols: 80, rows: 60 },
      openViews: {},
      nextZIndex: 100,
      links: [],
    }
    const result = migrate({ version: 1, payload: v1Payload })
    expect(result.instances).toBeDefined()
    expect(result.layout?.floating?.gridCols).toBe(GRID_COLS)
    expect(result.layout?.floating?.rowPx).toBe(ROW_PX)
    expect(result.customTunings).toEqual({})
  })

  it('migrates a V0 envelope (version: 0) through the full chain', () => {
    const result = migrate({ version: 0, payload: {} })
    expect(result.instances).toBeDefined()
    expect(result.links).toEqual([])
    expect(result.layout?.floating?.gridCols).toBe(GRID_COLS)
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
