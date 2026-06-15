import { describe, it, expect } from 'vitest'
import { generateScheduleJSON } from '../../../ts/schedule/editor/schedule_serializer'
import type { GroupDataJSON, IntervalDataJSON } from '../../../ts/schedule/editor/interval/types'

// generateScheduleJSON is a pure serialization function (no DOM, no registries).
// Tests for parseScheduleJSON belong in Phase 2 (dom/) because that function
// depends on instrumentCategory, which has feature-class imports.

const groupRow: GroupDataJSON = { rowType: 'group', name: 'Warm Up' }

const intervalRow: IntervalDataJSON = {
  rowType: 'interval',
  duration: '5:00',
  task: 'Scales',
  categoryName: 'Instrument',
  featureTypeName: 'Scale',
  featureArgsList: ['C', 'MAJOR'],
}

describe('generateScheduleJSON', () => {
  it('produces valid JSON', () => {
    const json = generateScheduleJSON('My Schedule', [intervalRow])
    expect(() => JSON.parse(json)).not.toThrow()
  })

  it('includes the schedule name when provided', () => {
    const json = generateScheduleJSON('Practice Session', [intervalRow])
    const parsed = JSON.parse(json)
    expect(parsed.name).toBe('Practice Session')
  })

  it('omits the name field when name is empty', () => {
    const json = generateScheduleJSON('', [intervalRow])
    const parsed = JSON.parse(json)
    expect(parsed.name).toBeUndefined()
  })

  it('omits the name field when name is null/undefined', () => {
    expect(JSON.parse(generateScheduleJSON(null, [intervalRow])).name).toBeUndefined()
    expect(JSON.parse(generateScheduleJSON(undefined, [intervalRow])).name).toBeUndefined()
  })

  it('trims whitespace from the schedule name', () => {
    const parsed = JSON.parse(generateScheduleJSON('  Trimmed  ', [intervalRow]))
    expect(parsed.name).toBe('Trimmed')
  })

  it('includes an items array in the output', () => {
    const parsed = JSON.parse(generateScheduleJSON('Test', [intervalRow]))
    expect(Array.isArray(parsed.items)).toBe(true)
    expect(parsed.items).toHaveLength(1)
  })

  it('preserves interval row fields', () => {
    const parsed = JSON.parse(generateScheduleJSON('Test', [intervalRow]))
    const item = parsed.items[0]
    expect(item.rowType).toBe('interval')
    expect(item.duration).toBe('5:00')
    expect(item.task).toBe('Scales')
    expect(item.featureTypeName).toBe('Scale')
    expect(item.featureArgsList).toEqual(['C', 'MAJOR'])
  })

  it('preserves group row fields', () => {
    const parsed = JSON.parse(generateScheduleJSON('Test', [groupRow]))
    const item = parsed.items[0]
    expect(item.rowType).toBe('group')
    expect(item.name).toBe('Warm Up')
  })

  it('handles mixed rows in correct order', () => {
    const parsed = JSON.parse(generateScheduleJSON('Test', [groupRow, intervalRow]))
    expect(parsed.items[0].rowType).toBe('group')
    expect(parsed.items[1].rowType).toBe('interval')
  })

  it('handles an empty items array', () => {
    const parsed = JSON.parse(generateScheduleJSON('Empty', []))
    expect(parsed.items).toEqual([])
  })

  it('produces pretty-printed JSON (indented)', () => {
    const json = generateScheduleJSON('Test', [intervalRow])
    expect(json).toContain('\n')
    expect(json).toContain('  ')
  })

  it('includes transitionDuration when greater than zero', () => {
    const parsed = JSON.parse(generateScheduleJSON('Test', [intervalRow], 10))
    expect(parsed.transitionDuration).toBe(10)
  })

  it('omits transitionDuration when zero (the default)', () => {
    expect(JSON.parse(generateScheduleJSON('Test', [intervalRow], 0)).transitionDuration).toBeUndefined()
    expect(JSON.parse(generateScheduleJSON('Test', [intervalRow])).transitionDuration).toBeUndefined()
  })

  it('floors a fractional transitionDuration', () => {
    const parsed = JSON.parse(generateScheduleJSON('Test', [intervalRow], 10.7))
    expect(parsed.transitionDuration).toBe(10)
  })
})
