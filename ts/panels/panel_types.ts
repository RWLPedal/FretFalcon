import { View } from "../view";
import { AppSettings } from "../settings";
import { LinkRecord } from "./link_types";

// Describes a registered type of floating view
export interface FloatingViewDescriptor {
  viewId: string; // Unique identifier (e.g., "instrument_color_legend")
  displayName: string; // User-friendly name (e.g., "Color Legend (Guitar)")
  categoryName: string; // Category it belongs to (e.g., "Guitar")
  defaultWidth?: number; // Optional default width
  defaultHeight?: number; // Optional default height
  showInMenu?: boolean; // Optional: If false, won't be shown in spawnable view lists. Defaults to true.
  /** When true, a config-toggle button (⚙) is shown in the title bar. */
  supportsConfigToggle?: boolean;
  // Factory function to create an instance of the view's logic
  createView: (initialState?: any, appSettings?: AppSettings) => View;
}

/**
 * Descriptor for fretboard-based floating views. These support per-instance
 * orientation rotation and zoom, which are surfaced as title-bar buttons.
 */
export interface FretboardFloatingViewDescriptor extends FloatingViewDescriptor {
  readonly isFretboardView: true;
  /** When true, a rotate button is shown in the title bar. */
  supportsRotate: boolean;
  /** When true, a zoom toggle button is shown in the title bar. */
  supportsZoom: boolean;
}

/** Returns true (and narrows the type) when a descriptor is a fretboard view. */
export function isFretboardDescriptor(
  d: FloatingViewDescriptor
): d is FretboardFloatingViewDescriptor {
  return (d as FretboardFloatingViewDescriptor).isFretboardView === true;
}

// Represents the state of an active, visible floating view instance.
// position and size are runtime-only pixel values — they are NOT persisted.
// gridPosition and gridSize are the persisted grid-unit coordinates.
export interface FloatingViewInstanceState {
  instanceId: string;
  viewId: string;
  /** Runtime only. Derived from gridPosition on load; updated on drag. */
  position: { x: number; y: number };
  /** Runtime only. Derived from gridSize on load; updated on user resize. */
  size?: { width: number; height: number };
  /** Persisted. Position in GRID_UNIT-sized cells. */
  gridPosition: { col: number; row: number };
  /** Persisted. Size in GRID_UNIT-sized cells. */
  gridSize?: { cols: number; rows: number };
  zIndex: number;
  viewState?: any;
  /** Per-instance orientation override, independent of the global Guitar setting. */
  orientationOverride?: "vertical" | "horizontal";
  /** Whether this instance is currently in the zoomed state. */
  zoomActive?: boolean;
}

// Structure for saving state to localStorage.
// referenceGrid records the viewport size (in grid units) at save time,
// enabling proportional scaling when loading on a different screen size.
//
// PERSISTENCE NOTE: This type is structurally equivalent to V1Payload in
// screen_config/screen_config_types.ts. FloatingViewManager never touches
// localStorage directly — it calls ScreenConfigManager.saveAutoSave() /
// loadAutoSave(), which handle versioning, migration, and serialization.
// The runtime-only fields (position, size) are stripped before persisting;
// see FloatingViewManager._buildStrippedPayload().
export interface FloatingViewManagerSaveState {
  /** Viewport dimensions in grid units at the time of saving. */
  referenceGrid: { cols: number; rows: number };
  openViews: { [instanceId: string]: FloatingViewInstanceState };
  nextZIndex: number;
  links?: LinkRecord[];
}
