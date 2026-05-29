// ts/screen_config/screen_config_manager.ts
//
// The sole owner of localStorage I/O for screen configurations.
// FloatingViewManager imports only this class and CurrentPayload from this package —
// it never sees version numbers, envelopes, or migration logic.

import {
  CURRENT_SCREEN_CONFIG_VERSION,
  CurrentPayload,
  NamedScreenConfig,
  NamedScreenConfigStore,
  VersionedScreenConfig,
} from "./screen_config_types";
import { migrate, MigrationError, FutureVersionError } from "./migrations";
import { COMPACT_BREAKPOINT_COLS, DEFAULT_CONFIGS, EMPTY_CONFIG } from "./default_configs";

/** localStorage key for all user-saved named presets (shared across contexts). */
const NAMED_CONFIGS_KEY = "savedScreenConfigs";

export class ScreenConfigManager {
  private readonly autoSaveKey: string;
  private readonly context: string;

  /**
   * @param autoSaveKey  The localStorage key for the auto-save slot.
   *                     "floatingViewStates_reference" for the reference page,
   *                     "floatingViewStates" for the practice page.
   * @param context      Informational label written into saved envelopes
   *                     so you can tell where a config was originally saved.
   */
  constructor(autoSaveKey: string, context: string) {
    this.autoSaveKey = autoSaveKey;
    this.context = context;
  }

  // ─── Auto-save ────────────────────────────────────────────────────────────

  /** Wraps the payload in a versioned envelope and writes it to localStorage.
   *  Called by FloatingViewManager whenever layout state changes. */
  public saveAutoSave(payload: CurrentPayload): void {
    if (typeof localStorage === "undefined") return;
    const envelope: VersionedScreenConfig = {
      version: CURRENT_SCREEN_CONFIG_VERSION,
      payload,
      savedAt: new Date().toISOString(),
      context: this.context,
    };
    try {
      localStorage.setItem(this.autoSaveKey, JSON.stringify(envelope));
    } catch (e) {
      console.error(`[ScreenConfigManager] Failed to write auto-save (key: ${this.autoSaveKey}):`, e);
    }
  }

  /** Reads the auto-save slot, runs the migration chain, and returns a
   *  CurrentPayload. Returns null if the slot is empty, malformed, or if the
   *  saved version is newer than this build (storage is left intact in that
   *  case). Returns a copy of EMPTY_CONFIG if migration fails unrecoverably. */
  public loadAutoSave(): CurrentPayload | null {
    return this._loadAndMigrate(this.autoSaveKey);
  }

  // ─── Import / export ──────────────────────────────────────────────────────

  /** Parse and migrate an arbitrary JSON string. Does NOT write to storage.
   *  Use for importing configs from external sources (paste, file, etc.).
   *  Returns null if the JSON is invalid or if the version is too new. */
  public importJson(json: string): CurrentPayload | null {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      console.warn("[ScreenConfigManager] importJson: invalid JSON.");
      return null;
    }
    return this._migrateOrNull(parsed, "importJson");
  }

  /** Serialize a payload as a versioned envelope JSON string.
   *  The envelope can later be round-tripped through importJson(). */
  public exportJson(payload: CurrentPayload): string {
    const envelope: VersionedScreenConfig = {
      version: CURRENT_SCREEN_CONFIG_VERSION,
      payload,
      savedAt: new Date().toISOString(),
      context: this.context,
    };
    return JSON.stringify(envelope, null, 2);
  }

  // ─── Named presets ────────────────────────────────────────────────────────

  /** Save the current payload under a user-chosen name. Overwrites any
   *  existing preset with the same name.
   *  Names beginning with "default:" are reserved for built-ins. */
  public saveNamed(name: string, payload: CurrentPayload, description?: string): void {
    if (name.startsWith("default:")) {
      console.warn(`[ScreenConfigManager] Cannot overwrite built-in preset "${name}".`);
      return;
    }
    if (typeof localStorage === "undefined") return;
    const store = this._loadNamedStore();
    const entry: NamedScreenConfig = {
      name,
      description,
      createdAt: new Date().toISOString(),
      config: {
        version: CURRENT_SCREEN_CONFIG_VERSION,
        payload,
        savedAt: new Date().toISOString(),
        context: this.context,
      },
    };
    store[name] = entry;
    try {
      localStorage.setItem(NAMED_CONFIGS_KEY, JSON.stringify(store));
    } catch (e) {
      console.error(`[ScreenConfigManager] Failed to save named preset "${name}":`, e);
    }
  }

  /** Load a named preset. The "default:" prefix routes to the built-in
   *  DEFAULT_CONFIGS registry; all other names are looked up in localStorage.
   *  Returns null if the name is not found or migration fails fatally.
   *  Pass viewportCols to enable automatic compact-variant selection for
   *  built-in presets that define one (see COMPACT_BREAKPOINT_COLS). */
  public loadNamed(name: string, viewportCols?: number): CurrentPayload | null {
    if (name.startsWith("default:")) {
      const key = name.slice("default:".length);
      const entry = DEFAULT_CONFIGS[key];
      if (!entry) {
        console.warn(`[ScreenConfigManager] Unknown built-in preset "${name}".`);
        return null;
      }
      if (entry.compact && viewportCols !== undefined && viewportCols < COMPACT_BREAKPOINT_COLS) {
        return entry.compact;
      }
      return entry.default;
    }
    if (typeof localStorage === "undefined") return null;
    const store = this._loadNamedStore();
    const entry = store[name];
    if (!entry) return null;
    return this._migrateOrNull(entry.config, `named:"${name}"`);
  }

  /** Returns all available preset names: built-in defaults (prefixed with
   *  "default:") followed by user-saved presets from localStorage. */
  public listNamed(): Array<{
    name: string;
    description?: string;
    createdAt?: string;
    isDefault: boolean;
  }> {
    const results: Array<{
      name: string;
      description?: string;
      createdAt?: string;
      isDefault: boolean;
    }> = [];

    for (const key of Object.keys(DEFAULT_CONFIGS)) {
      results.push({ name: `default:${key}`, isDefault: true });
    }

    if (typeof localStorage !== "undefined") {
      const store = this._loadNamedStore();
      for (const entry of Object.values(store)) {
        results.push({
          name: entry.name,
          description: entry.description,
          createdAt: entry.createdAt,
          isDefault: false,
        });
      }
    }

    return results;
  }

  /** Delete a user-saved named preset. No-op for "default:" names. */
  public deleteNamed(name: string): void {
    if (name.startsWith("default:") || typeof localStorage === "undefined") return;
    const store = this._loadNamedStore();
    if (!(name in store)) return;
    delete store[name];
    try {
      localStorage.setItem(NAMED_CONFIGS_KEY, JSON.stringify(store));
    } catch (e) {
      console.error(`[ScreenConfigManager] Failed to delete named preset "${name}":`, e);
    }
  }

  /** Returns a copy of EMPTY_CONFIG. No I/O; always safe to call. */
  public loadDefaultConfig(): CurrentPayload {
    return { ...EMPTY_CONFIG, openViews: {}, links: [] };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private _loadAndMigrate(key: string): CurrentPayload | null {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(key);
    if (raw === null) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn(`[ScreenConfigManager] Malformed JSON at "${key}"; clearing.`);
      localStorage.removeItem(key);
      return null;
    }

    return this._migrateOrNull(parsed, key);
  }

  private _migrateOrNull(parsed: unknown, label: string): CurrentPayload | null {
    try {
      return migrate(parsed);
    } catch (e) {
      if (e instanceof FutureVersionError) {
        // Do NOT clear storage — the user may be on an older build temporarily.
        console.error(`[ScreenConfigManager] ${label}: ${e.message}`);
        return null;
      }
      if (e instanceof MigrationError) {
        console.error(
          `[ScreenConfigManager] ${label}: migration failed (${e.message}). ` +
          `Falling back to empty config.`
        );
        return this.loadDefaultConfig();
      }
      console.error(`[ScreenConfigManager] ${label}: unexpected error during migration:`, e);
      return null;
    }
  }

  private _loadNamedStore(): NamedScreenConfigStore {
    try {
      const raw = localStorage.getItem(NAMED_CONFIGS_KEY);
      if (raw) return JSON.parse(raw) as NamedScreenConfigStore;
    } catch {
      console.warn("[ScreenConfigManager] Named preset store is malformed; resetting.");
      localStorage.removeItem(NAMED_CONFIGS_KEY);
    }
    return {};
  }
}
