import { describe, it, expect } from 'vitest'
import { parseDurationString, formatDuration } from '../../ts/time_utils'

describe('parseDurationString', () => {
  it('parses SS format', () => {
    expect(parseDurationString('0')).toBe(0)
    expect(parseDurationString('30')).toBe(30)
    expect(parseDurationString('59')).toBe(59)
  })

  it('parses MM:SS format', () => {
    expect(parseDurationString('0:00')).toBe(0)
    expect(parseDurationString('1:30')).toBe(90)
    expect(parseDurationString('10:00')).toBe(600)
    expect(parseDurationString('59:59')).toBe(3599)
  })

  it('parses H:MM:SS format', () => {
    expect(parseDurationString('1:00:00')).toBe(3600)
    expect(parseDurationString('1:30:45')).toBe(5445)
    expect(parseDurationString('2:00:00')).toBe(7200)
  })

  it('trims whitespace', () => {
    expect(parseDurationString('  5:00  ')).toBe(300)
  })

  it('throws on empty string', () => {
    expect(() => parseDurationString('')).toThrow()
  })

  it('throws on null/non-string input', () => {
    expect(() => parseDurationString(null as any)).toThrow()
    expect(() => parseDurationString(undefined as any)).toThrow()
  })

  it('throws when seconds >= 60', () => {
    expect(() => parseDurationString('0:60')).toThrow()
    expect(() => parseDurationString('1:60')).toThrow()
  })

  it('throws when minutes >= 60', () => {
    expect(() => parseDurationString('60:00')).toThrow()
    expect(() => parseDurationString('1:60:00')).toThrow()
  })

  it('throws on non-numeric values', () => {
    expect(() => parseDurationString('a:b')).toThrow()
    expect(() => parseDurationString('foo')).toThrow()
  })

  it('throws on too many colon segments', () => {
    expect(() => parseDurationString('1:2:3:4')).toThrow()
  })

  it('throws on negative values', () => {
    expect(() => parseDurationString('-1:00')).toThrow()
  })
})

describe('formatDuration', () => {
  it('formats as M:SS for sub-hour durations', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(30)).toBe('0:30')
    expect(formatDuration(60)).toBe('1:00')
    expect(formatDuration(90)).toBe('1:30')
    expect(formatDuration(3599)).toBe('59:59')
  })

  it('formats as H:MM:SS for one hour or more', () => {
    expect(formatDuration(3600)).toBe('1:00:00')
    expect(formatDuration(3661)).toBe('1:01:01')
    expect(formatDuration(5445)).toBe('1:30:45')
    expect(formatDuration(7200)).toBe('2:00:00')
  })

  it('pads minutes and seconds to two digits', () => {
    expect(formatDuration(61)).toBe('1:01')
    expect(formatDuration(3601)).toBe('1:00:01')
    expect(formatDuration(3660)).toBe('1:01:00')
  })

  it('returns 0:00 for negative input', () => {
    expect(formatDuration(-1)).toBe('0:00')
    expect(formatDuration(-100)).toBe('0:00')
  })

  it('returns 0:00 for NaN input', () => {
    expect(formatDuration(NaN)).toBe('0:00')
  })

  it('round-trips with parseDurationString', () => {
    const values = [0, 1, 30, 59, 60, 90, 600, 3599, 3600, 5445, 7200]
    for (const seconds of values) {
      expect(parseDurationString(formatDuration(seconds))).toBe(seconds)
    }
  })
})
