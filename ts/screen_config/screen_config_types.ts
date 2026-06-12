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
export const CURRENT_SCREEN_CONFIG_VERSION = 3;

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
  instanceId: string;
  viewId: string;
  gridPosition: { col: number; row: number };
  gridSize?: { cols: number; rows: number };
  zIndex: number;
  viewState?: unknown;
  orientationOverride?: "vertical" | "horizontal";
  zoomActive?: boolean;
}

export interface V1Payload {
  referenceGrid: { cols: number; rows: number };
  openViews: Record<string, V1PersistedViewEntry>;
  nextZIndex: number;
  links: LinkRecord[];
}

// ─── V2: adds customTunings for export/import ─────────────────────────────────

export interface V2Payload extends V1Payload {
  customTunings?: Partial<Record<string, { name: string; notes: number[] }[]>>;
}

// ─── V3: separates layout-independent instance data from layout geometry ──────
// Also unifies floating and tabbed persistence into a single storage key.

/** Instance data that is independent of which layout strategy is active. */
export interface V3PersistedViewEntry {
  instanceId: string;
  viewId: string;
  viewState?: unknown;
  collapsed?: boolean;
  orientationOverride?: "vertical" | "horizontal";
  zoomActive?: boolean;
}

/** Floating-layout geometry for a single instance. */
export interface V3FloatingPerInstance {
  gridPosition: { col: number; row: number };
  gridSize?: { cols: number; rows: number };
  zIndex: number;
}

/** All floating-layout state needed to restore positions and z-order. */
export interface V3FloatingLayout {
  referenceGrid: { cols: number; rows: number };
  nextZIndex: number;
  perInstance: Record<string, V3FloatingPerInstance>;
}

/** Tabbed-layout state: tab order and the last-active tab. */
export interface V3TabbedLayout {
  order: string[];
  activeId?: string;
}

export interface V3Payload {
  /** Layout-independent data for each open panel instance. */
  instances: Record<string, V3PersistedViewEntry>;
  /** All panel links. */
  links: LinkRecord[];
  /** Layout-specific data. Both keys may be present so state is preserved when
   *  switching between form factors. */
  layout: {
    floating?: V3FloatingLayout;
    tabbed?: V3TabbedLayout;
  };
  /** User-defined custom tunings, keyed by InstrumentName string value.
   *  Included in exports so custom tunings travel with the layout. */
  customTunings?: Partial<Record<string, { name: string; notes: number[] }[]>>;
}

// ─── Current version alias ────────────────────────────────────────────────────

/** The payload type at the current schema version. Update this alias (and only
 *  this alias) when bumping to a new version — the rest of the app uses
 *  CurrentPayload and remains unaffected. */
export type CurrentPayload = V3Payload;

// ─── Storage envelope ─────────────────────────────────────────────────────────

export interface VersionedScreenConfig {
  version: number;
  payload: unknown;
  savedAt?: string;
  context?: string;
}

// ─── Named preset types ───────────────────────────────────────────────────────

export interface NamedScreenConfig {
  name: string;
  description?: string;
  createdAt: string;
  config: VersionedScreenConfig;
}

export interface NamedScreenConfigStore {
  [name: string]: NamedScreenConfig;
}
