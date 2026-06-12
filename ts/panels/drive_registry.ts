// ts/panels/drive_registry.ts
import { DriveSignal, SignalKind } from './link_types';
import { ViewId } from '../core/ids';

export interface DriveSourceDescriptor {
  viewId: ViewId;
  featureTypeName?: string; // set for configurable features e.g. 'MultiLayerFretboard'
  /** Declarative list of SignalKinds this source can emit. Used for arrow tooltip display. */
  emittedKinds: SignalKind[];
  /** When true, this source can emit next-state signals in addition to current-state signals. */
  emitsNextSignals?: boolean;
  /**
   * Returns an ordered array of signals from this source's current state.
   * Index matters: signals[i] is routed to the i-th outgoing link.
   * BackingTrack returns a single-element array.
   * MultiLayerFretboard returns one ChordSignal per chord/driven layer in order.
   */
  extractSignals(eventDetail: unknown): DriveSignal[];
}

export interface DriveTargetSlot {
  featureTypeName: string;  // e.g. 'Chord', 'MultiLayerFretboard'
  /** For standalone (non-configurable) view targets, the floating view's viewId. */
  viewId?: ViewId;
  argName: string;          // config arg name this slot can drive
  label: string;            // human-readable label shown in the UI
  acceptedKinds: SignalKind[]; // uses same SignalKind enum as DriveSignal.kind
  /**
   * When true, signals update the arg directly without showing a "Driven" option
   * in the UI. Used for variadic toggle args (e.g. Qualities on TriadFeature).
   */
  transparent?: boolean;
  /**
   * Translates an incoming signal to the concrete config value string.
   * Returns null if this signal cannot be applied (e.g. null chord → no diagram).
   */
  resolveValue(signal: DriveSignal): string | null;
}

// ─── Private registries ───────────────────────────────────────────────────────

const sourceDescriptors = new Map<string, DriveSourceDescriptor>();
const targetSlots = new Map<string, DriveTargetSlot[]>();
// Maps floating-view viewId → featureTypeName for standalone view targets.
const viewIdToTargetFeatureTypeName = new Map<ViewId, string>();
// The single viewId whose instances broadcast to all panels (Global Key).
let _broadcastSourceViewId: ViewId | null = null;

// ─── Registration functions ───────────────────────────────────────────────────

/** Register a viewId whose instances broadcast signals to all other panels. */
export function registerBroadcastSource(vid: ViewId): void {
  _broadcastSourceViewId = vid;
}

/** Returns the registered broadcast-source viewId, or null if none. */
export function getBroadcastSourceViewId(): ViewId | null {
  return _broadcastSourceViewId;
}

export function registerDriveSource(descriptor: DriveSourceDescriptor): void {
  const key = descriptor.featureTypeName
    ? `${descriptor.viewId}::${descriptor.featureTypeName}`
    : descriptor.viewId;
  sourceDescriptors.set(key, descriptor);
}

export function registerDriveTarget(slot: DriveTargetSlot): void {
  const existing = targetSlots.get(slot.featureTypeName) ?? [];
  existing.push(slot);
  targetSlots.set(slot.featureTypeName, existing);
  if (slot.viewId) viewIdToTargetFeatureTypeName.set(slot.viewId, slot.featureTypeName);
}

// ─── Lookup functions ─────────────────────────────────────────────────────────

export function getDriveSourceDescriptor(
  viewId: ViewId | string,
  featureTypeName?: string
): DriveSourceDescriptor | undefined {
  if (featureTypeName) {
    const specific = sourceDescriptors.get(`${viewId}::${featureTypeName}`);
    if (specific) return specific;
  }
  return sourceDescriptors.get(viewId);
}

export function getDriveTargetSlots(featureTypeName: string): DriveTargetSlot[] {
  return targetSlots.get(featureTypeName) ?? [];
}

/**
 * Returns the featureTypeName registered for a standalone view target by its viewId.
 * Returns null if no target slot was registered with that viewId.
 */
export function getFeatureTypeNameByViewId(viewId: ViewId | string): string | null {
  return viewIdToTargetFeatureTypeName.get(viewId as ViewId) ?? null;
}
