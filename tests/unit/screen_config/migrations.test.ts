import { describe, it, expect } from 'vitest'
import { migrate, MigrationError, FutureVersionError } from '../../../ts/screen_config/migrations'
import { CURRENT_SCREEN_CONFIG_VERSION } from '../../../ts/screen_config/screen_config_types'

const CURRENT = CURRENT_SCREEN_CONFIG_VERSION // 2

describe('migrate — unversioned (V0) blobs', () => {
  it('fills in defaults for an empty object', () => {
    const result = migrate({})
    expect(result).toMatchObject({
      referenceGrid: { cols: 80, rows: 60 },
      openViews: {},
      nextZIndex: 100,
      links: [],
      customTunings: {},
    })
  })

  it('preserves fields that are already present', () => {
    const v0 = {
      referenceGrid: { cols: 120, rows: 90 },
      nextZIndex: 200,
      openViews: { 'fv-1': { instanceId: 'fv-1', viewId: 'timer', gridPosition: { col: 2, row: 3 }, zIndex: 201 } },
      links: [],
    }
    const result = migrate(v0)
    expect(result.referenceGrid).toEqual({ cols: 120, rows: 90 })
    expect(result.nextZIndex).toBe(200)
    expect(Object.keys(result.openViews!)).toHaveLength(1)
    expect(result.customTunings).toEqual({})
  })

  it('treats null as a V0 blob and throws MigrationError (migration cannot read null fields)', () => {
    expect(() => migrate(null)).toThrow(MigrationError)
  })
})

describe('migrate — versioned envelopes', () => {
  it('passes through a current-version payload unchanged', () => {
    const payload = {
      referenceGrid: { cols: 80, rows: 60 },
      openViews: {},
      nextZIndex: 100,
      links: [],
      customTunings: { Guitar: [{ name: 'Drop D', notes: [52, 57, 62, 67, 71, 76] }] },
    }
    expect(migrate({ version: CURRENT, payload })).toEqual(payload)
  })

  it('migrates a V1 envelope to current, adding customTunings', () => {
    const v1Payload = {
      referenceGrid: { cols: 80, rows: 60 },
      openViews: {},
      nextZIndex: 100,
      links: [],
    }
    const result = migrate({ version: 1, payload: v1Payload })
    expect(result).toMatchObject({ ...v1Payload, customTunings: {} })
  })

  it('migrates a V0 envelope (version: 0) through the full chain', () => {
    const result = migrate({ version: 0, payload: {} })
    expect(result).toMatchObject({ customTunings: {}, links: [] })
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
    expect(() => migrate({ version: CURRENT, payload: { referenceGrid: { cols: 80, rows: 60 }, openViews: {}, nextZIndex: 100, links: [] } })).not.toThrow()
  })
})
