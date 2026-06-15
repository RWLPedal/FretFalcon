import { describe, it, expect, afterEach } from 'vitest'
import { consumeLayoutParam, consumeLeftyParam } from '../../../ts/reference_page/url_params'
import { ScreenConfigManager } from '../../../ts/screen_config/screen_config_manager'
import { REFERENCE_LAYOUT } from '../../../ts/screen_config/default_configs'

// consumeLayoutParam touches `window.location` / `window.history`, which the node
// test environment lacks. Stub a minimal window and capture replaceState's new URL.
const origWindow = (globalThis as { window?: unknown }).window

function stubWindow(search: string): { url: string | null } {
  const captured: { url: string | null } = { url: null }
  ;(globalThis as { window?: unknown }).window = {
    location: { search, pathname: '/app', hash: '' },
    history: {
      replaceState: (_s: unknown, _t: unknown, url: string) => {
        captured.url = url
      },
    },
  }
  return captured
}

afterEach(() => {
  ;(globalThis as { window?: unknown }).window = origWindow
})

const scm = () => new ScreenConfigManager('test-autosave', 'test')

describe('consumeLayoutParam', () => {
  it('returns null and does not touch the URL when ?layout is absent', () => {
    const captured = stubWindow('?foo=bar')
    expect(consumeLayoutParam(scm())).toBeNull()
    expect(captured.url).toBeNull()
  })

  it('resolves a bare preset key to its built-in payload', () => {
    stubWindow('?layout=reference')
    expect(consumeLayoutParam(scm())).toEqual(REFERENCE_LAYOUT)
  })

  it('accepts an explicit "default:" prefix', () => {
    stubWindow('?layout=default:reference')
    expect(consumeLayoutParam(scm())).toEqual(REFERENCE_LAYOUT)
  })

  it('strips the layout param from the URL (apply-once) while keeping others', () => {
    const captured = stubWindow('?layout=reference&tutorial=true')
    consumeLayoutParam(scm())
    expect(captured.url).toBe('/app?tutorial=true')
  })

  it('strips the param even when the preset key is unknown, returning null', () => {
    const captured = stubWindow('?layout=nope')
    expect(consumeLayoutParam(scm())).toBeNull()
    expect(captured.url).toBe('/app')
  })

  it('treats an empty value as no selection but still consumes it', () => {
    const captured = stubWindow('?layout=')
    expect(consumeLayoutParam(scm())).toBeNull()
    expect(captured.url).toBe('/app')
  })
})

describe('consumeLeftyParam', () => {
  it('returns null and does not touch the URL when ?lefty is absent', () => {
    const captured = stubWindow('?layout=reference')
    expect(consumeLeftyParam()).toBeNull()
    expect(captured.url).toBeNull()
  })

  it('selects left for a bare ?lefty (empty value)', () => {
    const captured = stubWindow('?lefty')
    expect(consumeLeftyParam()).toBe('left')
    expect(captured.url).toBe('/app')
  })

  it('selects left for truthy values', () => {
    for (const v of ['true', '1', 'yes', 'anything']) {
      stubWindow(`?lefty=${v}`)
      expect(consumeLeftyParam(), v).toBe('left')
    }
  })

  it('selects right for explicit falsy values', () => {
    for (const v of ['false', '0', 'no', 'off']) {
      stubWindow(`?lefty=${v}`)
      expect(consumeLeftyParam(), v).toBe('right')
    }
  })

  it('strips the lefty param while keeping others', () => {
    const captured = stubWindow('?lefty=true&tutorial=true')
    consumeLeftyParam()
    expect(captured.url).toBe('/app?tutorial=true')
  })
})
