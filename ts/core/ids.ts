// ts/core/ids.ts
// Branded string ID types.  Each module mints its own IDs locally via
// viewId("...") or featureTypeId("...") — no central enumeration of views.
// Uniqueness is enforced at registration time (registry throws on duplicates).

declare const viewIdBrand: unique symbol;
/** Branded string uniquely identifying a registered view type. */
export type ViewId = string & { readonly [viewIdBrand]: true };

/** Mint a ViewId from a raw string. Call once per view, next to its definition. */
export function viewId(raw: string): ViewId {
  return raw as ViewId;
}

declare const featureTypeIdBrand: unique symbol;
/** Branded string uniquely identifying a feature type within a category. */
export type FeatureTypeId = string & { readonly [featureTypeIdBrand]: true };

/** Mint a FeatureTypeId from a raw string. */
export function featureTypeId(raw: string): FeatureTypeId {
  return raw as FeatureTypeId;
}

// ─── Well-known core IDs ──────────────────────────────────────────────────────
// Only IDs that core machinery must reference live here.
// All other view IDs are declared module-locally.

export const CORE_VIEW_IDS = {
  ConfigurableFeature: viewId('configurable_instrument_feature'),
  AnyView:             viewId('any_floating_view'),
  SchedulePanel:       viewId('schedule_floating_view'),
  // GlobalKey stays here until the broadcast flag lands in Phase 2
  GlobalKey:           viewId('global_key'),
} as const;

// ─── Nav sections ─────────────────────────────────────────────────────────────
// Closed set — extensions pick one; `Extensions` is the default bucket.

export const NavSection = {
  Fretboard:      'fretboard',
  PracticeTools:  'practice_tools',
  Sound:          'sound',
  Schedule:       'schedule',
  Utilities:      'utilities',
  Extensions:     'extensions',
} as const;

export type NavSectionId = (typeof NavSection)[keyof typeof NavSection];

// ─── Runtime parse helpers ────────────────────────────────────────────────────
// Used when reading raw strings from localStorage or event details.
// Validates against the set of registered IDs; returns null (skip + warn) if unknown.

let _registeredViewIds: Set<string> | null = null;
let _registeredFeatureTypeIds: Set<string> | null = null;

/** Called by panel_registry when a view is registered. */
export function _trackViewId(id: ViewId): void {
  if (!_registeredViewIds) _registeredViewIds = new Set();
  _registeredViewIds.add(id);
}

/** Called by feature_registry when a feature type is registered. */
export function _trackFeatureTypeId(id: FeatureTypeId): void {
  if (!_registeredFeatureTypeIds) _registeredFeatureTypeIds = new Set();
  _registeredFeatureTypeIds.add(id);
}

/**
 * Parse a raw string from persistence as a ViewId.
 * Returns null and logs a warning if the id is not registered.
 * Callers must skip the entry gracefully on null.
 */
export function parseViewId(raw: string): ViewId | null {
  if (_registeredViewIds?.has(raw)) return raw as ViewId;
  console.warn(`[parseViewId] Unknown viewId "${raw}" — skipping.`);
  return null;
}

/**
 * Parse a raw string as a FeatureTypeId.
 * Returns null and logs a warning if the id is not registered.
 */
export function parseFeatureTypeId(raw: string): FeatureTypeId | null {
  if (_registeredFeatureTypeIds?.has(raw)) return raw as FeatureTypeId;
  console.warn(`[parseFeatureTypeId] Unknown featureTypeId "${raw}" — skipping.`);
  return null;
}
