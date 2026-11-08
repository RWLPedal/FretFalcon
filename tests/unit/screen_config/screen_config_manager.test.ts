// tests/unit/screen_config/screen_config_manager.test.ts
// ScreenConfigManager — the sole localStorage owner for layout persistence.
//
// Runs under vitest's node environment against a Map-backed localStorage stub; every
// method guards `typeof localStorage === "undefined"`, which the last block pins.
// The migration chain itself is covered by migrations.test.ts — here we cover the
// storage lifecycle around it: autosave, named presets, import/export, corruption.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ScreenConfigManager } from '../../../ts/screen_config/screen_config_manager';
import {
  CURRENT_SCREEN_CONFIG_VERSION,
  CurrentPayload,
} from '../../../ts/screen_config/screen_config_types';
import { DEFAULT_CONFIGS, EMPTY_CONFIG, REFERENCE_LAYOUT } from '../../../ts/screen_config/default_configs';

const AUTOSAVE_KEY = 'floatingViewStates_reference';
const NAMED_KEY = 'savedScreenConfigs';

function makeMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

/** A small but real V4 payload (structurally cloned from a bundled layout). */
function samplePayload(): CurrentPayload {
  return JSON.parse(JSON.stringify(REFERENCE_LAYOUT)) as CurrentPayload;
}

let storage: Storage;

beforeEach(() => {
  storage = makeMemoryStorage();
  vi.stubGlobal('localStorage', storage);
  // The manager logs corruption/rejection paths; keep test output clean.
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const makeManager = () => new ScreenConfigManager(AUTOSAVE_KEY, 'reference');

describe('auto-save', () => {
  it('round-trips a payload through the versioned envelope', () => {
    const mgr = makeManager();
    const payload = samplePayload();
    mgr.saveAutoSave(payload);

    // Envelope shape on disk.
    const envelope = JSON.parse(storage.getItem(AUTOSAVE_KEY)!);
    expect(envelope.version).toBe(CURRENT_SCREEN_CONFIG_VERSION);
    expect(envelope.context).toBe('reference');

    expect(mgr.loadAutoSave()).toEqual(payload);
  });

  it('returns null for an empty slot', () => {
    expect(makeManager().loadAutoSave()).toBeNull();
  });

  it('clears and returns null for malformed JSON in the slot', () => {
    storage.setItem(AUTOSAVE_KEY, '{not json');
    expect(makeManager().loadAutoSave()).toBeNull();
    expect(storage.getItem(AUTOSAVE_KEY)).toBeNull();
  });

  it('returns null and PRESERVES storage for a future version (older build scenario)', () => {
    const envelope = { version: CURRENT_SCREEN_CONFIG_VERSION + 1, payload: {} };
    storage.setItem(AUTOSAVE_KEY, JSON.stringify(envelope));
    expect(makeManager().loadAutoSave()).toBeNull();
    // Deliberate: the user may be on an older build temporarily — never destroy.
    expect(storage.getItem(AUTOSAVE_KEY)).toBe(JSON.stringify(envelope));
  });
});

describe('export / import', () => {
  it('exportJson → importJson round-trips the payload without touching storage', () => {
    const mgr = makeManager();
    const payload = samplePayload();
    const json = mgr.exportJson(payload);
    expect(storage.length).toBe(0);
    expect(mgr.importJson(json)).toEqual(payload);
    expect(storage.length).toBe(0);
  });

  it('importJson returns null for invalid JSON', () => {
    expect(makeManager().importJson('nope{')).toBeNull();
  });
});

describe('named presets', () => {
  it('save → list → load → delete lifecycle', () => {
    const mgr = makeManager();
    const payload = samplePayload();
    mgr.saveNamed('my setup', payload, 'weekday practice');

    const listed = mgr.listNamed();
    const mine = listed.find((e) => e.name === 'my setup');
    expect(mine).toMatchObject({ isDefault: false, description: 'weekday practice' });
    expect(mine?.createdAt).toBeTruthy();

    expect(mgr.loadNamed('my setup')).toEqual(payload);

    mgr.deleteNamed('my setup');
    expect(mgr.loadNamed('my setup')).toBeNull();
    expect(mgr.listNamed().some((e) => e.name === 'my setup')).toBe(false);
  });

  it('saving the same name overwrites the previous payload', () => {
    const mgr = makeManager();
    const first = samplePayload();
    mgr.saveNamed('slot', first);
    const second = samplePayload();
    second.instances = {};
    mgr.saveNamed('slot', second);
    expect(mgr.loadNamed('slot')).toEqual(second);
    expect(mgr.listNamed().filter((e) => e.name === 'slot')).toHaveLength(1);
  });

  it('lists every built-in ahead of user presets, "default:"-prefixed', () => {
    const mgr = makeManager();
    mgr.saveNamed('user one', samplePayload());
    const listed = mgr.listNamed();
    const defaults = listed.filter((e) => e.isDefault);
    expect(defaults.map((e) => e.name).sort()).toEqual(
      Object.keys(DEFAULT_CONFIGS)
        .map((k) => `default:${k}`)
        .sort(),
    );
    // Built-ins first, then user presets.
    expect(listed.findIndex((e) => !e.isDefault)).toBe(defaults.length);
  });

  it('"default:" names load from DEFAULT_CONFIGS and are unwritable/undeletable', () => {
    const mgr = makeManager();
    expect(mgr.loadNamed('default:reference')).toBe(REFERENCE_LAYOUT);
    expect(mgr.loadNamed('default:nope')).toBeNull();

    // Writes to reserved names must not create a store entry.
    mgr.saveNamed('default:reference', samplePayload());
    expect(storage.getItem(NAMED_KEY)).toBeNull();

    // Deletes of reserved names are no-ops.
    mgr.saveNamed('keep', samplePayload());
    mgr.deleteNamed('default:reference');
    expect(mgr.loadNamed('keep')).not.toBeNull();
    expect(mgr.loadNamed('default:reference')).toBe(REFERENCE_LAYOUT);
  });

  it('resets a malformed named store instead of throwing', () => {
    storage.setItem(NAMED_KEY, '][');
    const mgr = makeManager();
    expect(mgr.listNamed().every((e) => e.isDefault)).toBe(true);
    // A later save works on the reset store.
    mgr.saveNamed('fresh', samplePayload());
    expect(mgr.loadNamed('fresh')).not.toBeNull();
  });
});

describe('loadDefaultConfig', () => {
  it('returns a copy of EMPTY_CONFIG, not the frozen original', () => {
    const cfg = makeManager().loadDefaultConfig();
    expect(cfg).toEqual(EMPTY_CONFIG);
    expect(cfg).not.toBe(EMPTY_CONFIG);
  });
});

describe('without localStorage (SSR / privacy-mode guard)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('localStorage', undefined);
  });

  it('every storage-touching method is a safe no-op', () => {
    const mgr = makeManager();
    expect(() => mgr.saveAutoSave(samplePayload())).not.toThrow();
    expect(mgr.loadAutoSave()).toBeNull();
    expect(() => mgr.saveNamed('x', samplePayload())).not.toThrow();
    expect(mgr.loadNamed('x')).toBeNull();
    expect(() => mgr.deleteNamed('x')).not.toThrow();
    // Built-ins and the empty config need no storage at all.
    expect(mgr.loadNamed('default:reference')).toBe(REFERENCE_LAYOUT);
    expect(mgr.listNamed().every((e) => e.isDefault)).toBe(true);
    expect(mgr.loadDefaultConfig()).toEqual(EMPTY_CONFIG);
  });
});
