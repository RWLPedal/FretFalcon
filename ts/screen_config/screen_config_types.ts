// ts/screen_config/screen_config_types.ts
//
// All versioned type definitions for the screen configuration persistence system.
// This is a pure types file — no logic. The only external dependency is LinkRecord,
// because links are structurally part of the saved layout.

import { LinkRecord } from "../panels/link_types";

// Re-export so callers only need to import from this package.
export type { LinkRecord };

// ─── Version constant ─────────────────────────────────────────────────────────

/** The schema version this build of the app reads and writes. Bump when the
 *  payload shape changes in a breaking way, and add a migration step in
 *  migrations.ts. See SCREEN_CONFIG_FORMAT.md for the full checklist. */
export const CURRENT_SCREEN_CONFIG_VERSION = 1;

// ─── V0: legacy (unversioned) ─────────────────────────────────────────────────

/** V0 is not a real persisted format — it is the legacy shape written before
 *  versioning was introduced (no "version" field in storage). It exists only
 *  so the V0→V1 migration function has a typed input. */
export interface V0Payload {
  referenceGrid?: { cols: number; rows: number };
  openViews?: Record<string, unknown>;
  nextZIndex?: number;
  links?: unknown[];
}

// ─── V1: first explicit version ───────────────────────────────────────────────

/** Persisted state of a single floating view instance.
 *  Runtime-only fields (pixel position, pixel size) are excluded — they are
 *  derived from gridPosition/gridSize when the view is restored. */
export interface V1PersistedViewEntry {
  /** Stable runtime ID, e.g. "fv-3". Preserved across saves so links survive. */
  instanceId: string;
  /** The registered viewId that identifies which view type to recreate. */
  viewId: string;
  /** Position in GRID_UNIT-sized cells at the time of saving. */
  gridPosition: { col: number; row: number };
  /** Size in GRID_UNIT-sized cells at the time of saving. */
  gridSize?: { cols: number; rows: number };
  zIndex: number;
  /** Opaque blob owned entirely by the individual view. The persistence layer
   *  stores and restores this without interpreting it. If a view's internal
   *  state format needs to change, the view itself should include a version
   *  marker (e.g. { _v: 2, ... }) and handle migration in createView(). */
  viewState?: unknown;
  /** Per-instance orientation override, independent of the global instrument setting. */
  orientationOverride?: "vertical" | "horizontal";
  /** Whether this instance is in the zoomed state. */
  zoomActive?: boolean;
}

export interface V1Payload {
  /** Viewport dimensions in grid units at the time of saving, used to scale
   *  positions proportionally when loading on a different screen size. */
  referenceGrid: { cols: number; rows: number };
  openViews: Record<string, V1PersistedViewEntry>;
  nextZIndex: number;
  /** Always an array (empty if there are no links). Normalised from the
   *  optional field in FloatingViewManagerSaveState. */
  links: LinkRecord[];
}

// ─── Current version alias ────────────────────────────────────────────────────

/** The payload type at the current schema version. Update this alias (and only
 *  this alias) when bumping to a new version — the rest of the app uses
 *  CurrentPayload and remains unaffected. */
export type CurrentPayload = V1Payload;

// ─── Storage envelope ─────────────────────────────────────────────────────────

/** Every value written to localStorage is wrapped in this envelope.
 *  The "version" field is read before the payload is touched, enabling
 *  the migration chain to apply the correct sequence of transformations. */
export interface VersionedScreenConfig {
  version: number;
  payload: unknown;
  /** ISO-8601 timestamp written at save time. Informational only. */
  savedAt?: string;
  /** "reference" | "practice" — records which page context saved this. Informational only. */
  context?: string;
}

// ─── Named preset types ───────────────────────────────────────────────────────

export interface NamedScreenConfig {
  name: string;
  description?: string;
  /** ISO-8601 timestamp. */
  createdAt: string;
  config: VersionedScreenConfig;
}

export interface NamedScreenConfigStore {
  [name: string]: NamedScreenConfig;
}
