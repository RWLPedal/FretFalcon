// ts/panels/link_manager.ts
import { HandleSide, LinkRecord, DriveSignal, SignalKind, SignalState, GrooveSignal, PlaySignal, StrumSignal } from './link_types';
import { LinkOverlay } from './link_overlay';
import { ArrowMeta } from './link_arrow';
import {
  getDriveSourceDescriptor,
  getDriveTargetSlots,
  getFeatureTypeNameByViewId,
} from './drive_registry';
import { emitEvent, onEvent } from '../core/events';

export class LinkManager {
  private links: LinkRecord[] = [];
  private nextLinkId = 1;
  private overlay: LinkOverlay;

  // Maps wrapper HTMLElement → instanceId for efficient event routing
  private wrapperToInstanceId = new Map<HTMLElement, string>();
  // Maps instanceId → viewId (for looking up source descriptors)
  private instanceIdToViewId: (id: string) => string | null;
  // Maps instanceId → featureTypeName (for drive target slot lookup)
  private instanceIdToFeatureTypeName: ((id: string) => string | null) | null;

  // Caches the most recent signals from each source so new links get immediate delivery
  private lastSourceSignals = new Map<string, DriveSignal[]>();

  // RAF handle for debounced redraws
  private redrawScheduled = false;

  // The viewId whose instances act as global broadcast sources (e.g. 'global_key').
  // When set, signals from that panel go to ALL instances and suppress competing kinds.
  private readonly globalKeyViewId: string | null;
  private globalSourceInstanceId: string | null = null;

  constructor(
    private viewAreaEl: HTMLElement,
    private getWrapperEl: (instanceId: string) => HTMLElement | null,
    getViewId: (instanceId: string) => string | null,
    private getContentEl: (instanceId: string) => HTMLElement | null = () => null,
    getFeatureTypeName: ((instanceId: string) => string | null) | null = null,
    globalKeyViewId: string | null = null
  ) {
    this.instanceIdToViewId = getViewId;
    this.instanceIdToFeatureTypeName = getFeatureTypeName;
    this.globalKeyViewId = globalKeyViewId;
    this.overlay = new LinkOverlay(viewAreaEl);

    this.overlay.onLinkCreated = (srcId, srcHandle, tgtId, tgtHandle) => {
      this.addLink(srcId, srcHandle, tgtId, tgtHandle);
    };
    this.overlay.onLinkDeleted = (linkId) => {
      this.removeLink(linkId);
    };

    // Listen for backing-track-tick (real-time per-measure chord signal)
    onEvent(viewAreaEl, 'backing-track-tick', (detail, e) => {
      const instanceId = this.resolveSourceInstanceId(e);
      if (!instanceId) return;
      const viewId = this.instanceIdToViewId(instanceId);
      if (!viewId) return;
      const descriptor = getDriveSourceDescriptor(viewId);
      if (!descriptor) return;
      const signals = descriptor.extractSignals(detail);
      this.routeSignals(instanceId, signals);
    });

    // Listen for metronome-tempo-changed (BPM/config change from MetronomeView)
    onEvent(viewAreaEl, 'metronome-tempo-changed', (detail, e) => {
      const instanceId = this.resolveSourceInstanceId(e);
      if (!instanceId) return;
      const viewId = this.instanceIdToViewId(instanceId);
      if (!viewId) return;
      const descriptor = getDriveSourceDescriptor(viewId);
      if (!descriptor) return;
      const signals = descriptor.extractSignals(detail);
      this.routeSignals(instanceId, signals);
    });

    // Listen for groove-tick (per-beat sync signal from MetronomeView or BackingTrackView)
    onEvent(viewAreaEl, 'groove-tick', (detail, e) => {
      const instanceId = this.resolveSourceInstanceId(e);
      if (!instanceId) return;
      const signal: GrooveSignal = {
        kind:   SignalKind.Groove,
        bpm:    detail.bpm,
        timeSig: detail.timeSig ?? { beats: 4, division: 4 },
        swing:  detail.swing ?? 0,
        beat:   typeof detail.beat === 'number' ? detail.beat : undefined,
      };
      this.routeBeatSignal(instanceId, signal);
    });

    // Listen for strum-tick (per-step strum action from StrumView)
    onEvent(viewAreaEl, 'strum-tick', (detail, e) => {
      const instanceId = this.resolveSourceInstanceId(e);
      if (!instanceId) return;
      const signal: StrumSignal = {
        kind:       SignalKind.Strum,
        action:     detail.action,
        direction:  detail.direction,
        bpm:        detail.bpm,
        timeSig:    detail.timeSig,
        step:       detail.step,
        totalSteps: detail.totalSteps,
      };
      this.routeUncachedSignal(instanceId, signal);
    });

    // Listen for transport-changed (play/stop state from BackingTrackView or other transport sources)
    onEvent(viewAreaEl, 'transport-changed', (detail, e) => {
      const instanceId = this.resolveSourceInstanceId(e);
      if (!instanceId) return;
      const signal: PlaySignal = { kind: SignalKind.Play, playing: detail.playing };
      this.routeUncachedSignal(instanceId, signal);
    });

    // Listen for cof-key-selected (Circle of Fifths key/chord selection)
    onEvent(viewAreaEl, 'cof-key-selected', (detail, e) => {
      const instanceId = this.resolveSourceInstanceId(e);
      if (!instanceId) return;
      const viewId = this.instanceIdToViewId(instanceId);
      if (!viewId) return;
      const descriptor = getDriveSourceDescriptor(viewId);
      if (!descriptor) return;
      const signals = descriptor.extractSignals(detail);
      this.routeSignals(instanceId, signals);
    });

    // Listen for feature-state-changed (for configurable features as sources)
    onEvent(viewAreaEl, 'feature-state-changed', (detail, e) => {
      if (!detail.featureTypeName) return;
      const instanceId = this.resolveSourceInstanceId(e);
      if (!instanceId) return;
      const viewId = this.instanceIdToViewId(instanceId);
      if (!viewId) return;
      const descriptor = getDriveSourceDescriptor(viewId, detail.featureTypeName);
      if (!descriptor) return;
      const signals = descriptor.extractSignals(detail);
      this.routeSignals(instanceId, signals);
    });

    // Listen for schedule-feature-changed (ScheduleFloatingView → link system)
    onEvent(viewAreaEl, 'schedule-feature-changed', (detail, e) => {
      const instanceId = this.resolveSourceInstanceId(e);
      if (!instanceId) return;
      const viewId = this.instanceIdToViewId(instanceId);
      if (!viewId) return;
      const descriptor = getDriveSourceDescriptor(viewId);
      if (!descriptor) return;
      const signals = descriptor.extractSignals(detail);
      this.routeSignals(instanceId, signals);
    });

    // Relay signals forwarded by features (e.g. MultiLayerFretboard driven update → ChordDiagram)
    onEvent(viewAreaEl, 'feature-signal-relay', (detail, e) => {
      if (!detail.signal) return;
      const instanceId = this.resolveSourceInstanceId(e);
      if (!instanceId) return;
      this.routeSignals(instanceId, [detail.signal]);
    });

    // Redraw arrows whenever window positions change (MutationObserver on style changes)
    const mo = new MutationObserver((mutations) => {
      if (mutations.some(m => !(m.target as Element).classList?.contains('link-signal-tooltip'))) {
        this.scheduleRedraw();
      }
    });
    mo.observe(viewAreaEl, { attributes: true, attributeFilter: ['style'], subtree: true });
  }

  // ─── Initialization ────────────────────────────────────────────────────────

  public initialize(existingLinks: LinkRecord[]): void {
    this.links = existingLinks.filter(link =>
      this.getWrapperEl(link.sourceInstanceId) !== null &&
      this.getWrapperEl(link.targetInstanceId) !== null
    );
    if (this.links.length) {
      const maxId = Math.max(...this.links.map(l => parseInt(l.id.replace('link-', ''), 10) || 0));
      this.nextLinkId = maxId + 1;
    }
    this.scheduleRedraw();
    this.notifyAllLinkStatuses();
    // Replay any signals that sources emitted before links were established
    // (e.g. a schedule prepared during render() before initialize() ran).
    for (const link of this.links) {
      const cached = this.lastSourceSignals.get(link.sourceInstanceId);
      if (cached?.length) this.routeSignalsToTarget(link, cached);
    }
  }

  // ─── Window lifecycle ──────────────────────────────────────────────────────

  /**
   * Re-notifies a view of its current link status and re-delivers any cached
   * signals from connected sources. Call this after replacing a view's content
   * (zoom, rotate, settings change) so the new render reflects the live state.
   */
  public refreshForInstance(instanceId: string): void {
    this.notifyLinkStatus(instanceId);
    const incomingLinks = this.links.filter(l => l.targetInstanceId === instanceId);
    incomingLinks.forEach(link => {
      const cached = this.lastSourceSignals.get(link.sourceInstanceId);
      if (cached?.length) this.routeSignalsToTarget(link, cached);
    });
  }

  public onWindowSpawned(instanceId: string, wrapperEl: HTMLElement): void {
    this.wrapperToInstanceId.set(wrapperEl, instanceId);
    this.overlay.registerWrapper(instanceId, wrapperEl);

    if (this.globalKeyViewId && this.instanceIdToViewId(instanceId) === this.globalKeyViewId) {
      // This is the global source panel; mark it, then notify all existing panels so
      // they switch to "Driven" mode before the initial broadcast arrives on the next rAF.
      this.globalSourceInstanceId = instanceId;
      this.notifyAllLinkStatuses();
    } else if (this.globalSourceInstanceId !== null) {
      // Deliver current cached global signals to the newly opened panel, and notify it
      // that it has an incoming link so it switches to "Driven" mode first.
      this.notifyLinkStatus(instanceId);
      const cached = this.lastSourceSignals.get(this.globalSourceInstanceId);
      if (cached?.length) this.deliverSignalsToInstance(instanceId, cached);
    }
  }

  public onWindowDestroyed(instanceId: string): void {
    const wrapperEl = this.getWrapperEl(instanceId);
    if (wrapperEl) {
      this.overlay.unregisterWrapper(instanceId);
      this.wrapperToInstanceId.delete(wrapperEl);
    }
    if (instanceId === this.globalSourceInstanceId) {
      this.globalSourceInstanceId = null;
      // Re-notify all panels so those without explicit links leave "Driven" mode.
      this.notifyAllLinkStatuses();
    }
    this.lastSourceSignals.delete(instanceId);
    // Remove all links involving this instance
    const before = this.links.length;
    const affectedTargets = new Set<string>();
    this.links
      .filter(l => l.targetInstanceId === instanceId)
      .forEach(l => affectedTargets.add(l.sourceInstanceId));
    this.links = this.links.filter(
      l => l.sourceInstanceId !== instanceId && l.targetInstanceId !== instanceId
    );
    if (this.links.length !== before) {
      // Notify remaining windows of updated link status
      affectedTargets.forEach(tgtId => this.notifyLinkStatus(tgtId));
      this.scheduleRedraw();
    }
  }

  // ─── Save state ────────────────────────────────────────────────────────────

  public getLinks(): LinkRecord[] {
    return [...this.links];
  }

  public createLink(
    sourceId: string,
    sourceHandle: HandleSide,
    targetId: string,
    targetHandle: HandleSide
  ): void {
    this.addLink(sourceId, sourceHandle, targetId, targetHandle);
  }

  // ─── Link management ───────────────────────────────────────────────────────

  private addLink(
    sourceId: string,
    sourceHandle: HandleSide,
    targetId: string,
    targetHandle: HandleSide
  ): void {
    // Prevent duplicate links between the same pair
    const exists = this.links.some(
      l => l.sourceInstanceId === sourceId && l.targetInstanceId === targetId
    );
    if (exists) return;

    const link: LinkRecord = {
      id: `link-${this.nextLinkId++}`,
      sourceInstanceId: sourceId,
      sourceHandle,
      targetInstanceId: targetId,
      targetHandle,
    };
    this.links.push(link);
    this.notifyLinkStatus(targetId);
    // Immediately deliver cached signals from this source to the new target
    const cached = this.lastSourceSignals.get(sourceId);
    if (cached?.length) this.routeSignalsToTarget(link, cached);
    this.scheduleRedraw();
  }

  private removeLink(linkId: string): void {
    const link = this.links.find(l => l.id === linkId);
    if (!link) return;
    this.links = this.links.filter(l => l.id !== linkId);
    this.notifyLinkStatus(link.targetInstanceId);
    this.scheduleRedraw();
  }

  // ─── Signal routing ────────────────────────────────────────────────────────

  private routeSignals(sourceInstanceId: string, signals: DriveSignal[]): void {
    if (!signals.length) return;
    // Merge into cache keyed by (kind, state) so current and next signals of the same
    // kind coexist, and Groove config updates don't evict cached Chord/Key signals.
    const existing = this.lastSourceSignals.get(sourceInstanceId) ?? [];
    const newKeys = new Set(signals.map(s => `${s.kind}:${s.state ?? SignalState.Current}`));
    const merged = [...existing.filter(s => !newKeys.has(`${s.kind}:${s.state ?? SignalState.Current}`)), ...signals];
    this.lastSourceSignals.set(sourceInstanceId, merged);

    if (sourceInstanceId === this.globalSourceInstanceId) {
      // Global source: broadcast to every registered panel.
      this.deliverToAll(sourceInstanceId, signals);
      return;
    }

    // Non-global source: suppress any signal kinds that the global source already owns.
    let effectiveSignals = signals;
    if (this.globalSourceInstanceId !== null) {
      const globalCache = this.lastSourceSignals.get(this.globalSourceInstanceId) ?? [];
      const globalKinds = new Set(globalCache.map(s => s.kind));
      effectiveSignals = signals.filter(s => !globalKinds.has(s.kind));
      if (!effectiveSignals.length) return;
    }

    const outgoing = this.links.filter(l => l.sourceInstanceId === sourceInstanceId);
    outgoing.forEach(link => this.routeSignalsToTarget(link, effectiveSignals));
  }

  private deliverToAll(sourceInstanceId: string, signals: DriveSignal[]): void {
    for (const [, targetInstanceId] of this.wrapperToInstanceId) {
      if (targetInstanceId !== sourceInstanceId) {
        this.deliverSignalsToInstance(targetInstanceId, signals);
      }
    }
  }

  private deliverSignalsToInstance(targetInstanceId: string, signals: DriveSignal[]): void {
    const targetEl = this.getContentEl(targetInstanceId) ?? this.getWrapperEl(targetInstanceId);
    if (!targetEl) return;
    signals.forEach(signal => {
      emitEvent(targetEl, 'drive-signal', { signal, linkId: 'global' });
    });
  }

  // Routes a per-beat groove tick without touching the signal cache, so cached
  // chord/key/groove-config signals remain intact for newly connected targets.
  private routeBeatSignal(sourceInstanceId: string, signal: GrooveSignal): void {
    const outgoing = this.links.filter(l => l.sourceInstanceId === sourceInstanceId);
    outgoing.forEach(link => this.routeSignalsToTarget(link, [signal]));
  }

  // Routes any signal without caching — for real-time state (transport, beat ticks)
  // where newly-linked targets should not inherit stale values.
  private routeUncachedSignal(sourceInstanceId: string, signal: DriveSignal): void {
    const outgoing = this.links.filter(l => l.sourceInstanceId === sourceInstanceId);
    outgoing.forEach(link => this.routeSignalsToTarget(link, [signal]));
  }

  private routeSignalsToTarget(link: LinkRecord, signals: DriveSignal[]): void {
    const targetEl = this.getContentEl(link.targetInstanceId) ?? this.getWrapperEl(link.targetInstanceId);
    if (!targetEl) return;
    signals.forEach(signal => {
      emitEvent(targetEl, 'drive-signal', { signal, linkId: link.id });
    });
  }

  // ─── Arrow metadata ────────────────────────────────────────────────────────

  private getArrowMeta(link: LinkRecord): ArrowMeta {
    // Source descriptor
    const sourceViewId = this.instanceIdToViewId(link.sourceInstanceId) ?? '';
    const sourceFeatureTypeName = this.instanceIdToFeatureTypeName?.(link.sourceInstanceId) ?? undefined;
    const sourceDescriptor = getDriveSourceDescriptor(sourceViewId, sourceFeatureTypeName);

    // Target slots — look up by featureTypeName (configurable) or by viewId (standalone)
    const targetViewId = this.instanceIdToViewId(link.targetInstanceId) ?? '';
    const targetFeatureTypeName =
      this.instanceIdToFeatureTypeName?.(link.targetInstanceId) ??
      getFeatureTypeNameByViewId(targetViewId) ??
      null;
    const targetSlots = targetFeatureTypeName ? getDriveTargetSlots(targetFeatureTypeName) : [];
    const acceptedKinds = [...new Set(targetSlots.flatMap(s => s.acceptedKinds))];

    return {
      emittedKinds: sourceDescriptor?.emittedKinds ?? [],
      acceptedKinds,
      lastSignals: this.lastSourceSignals.get(link.sourceInstanceId) ?? [],
    };
  }

  // ─── Link status notifications ─────────────────────────────────────────────

  private notifyLinkStatus(instanceId: string): void {
    // Skip notifying the global source panel itself.
    if (instanceId === this.globalSourceInstanceId) return;
    const targetEl = this.getContentEl(instanceId) ?? this.getWrapperEl(instanceId);
    if (!targetEl) return;
    const incoming = this.links.filter(l => l.targetInstanceId === instanceId);
    // A panel has "incoming links" if it has explicit links OR if the global source is open.
    const hasIncoming = incoming.length > 0 || this.globalSourceInstanceId !== null;
    const hasNextSignals = incoming.some(l => {
      const viewId = this.instanceIdToViewId(l.sourceInstanceId) ?? '';
      const ftName = this.instanceIdToFeatureTypeName?.(l.sourceInstanceId) ?? undefined;
      return getDriveSourceDescriptor(viewId, ftName)?.emitsNextSignals === true;
    });
    emitEvent(targetEl, 'link-status-changed', { hasIncomingLinks: hasIncoming, hasNextSignals });
  }

  private notifyAllLinkStatuses(): void {
    const allInstances = new Set<string>();
    this.links.forEach(l => {
      allInstances.add(l.sourceInstanceId);
      allInstances.add(l.targetInstanceId);
    });
    allInstances.forEach(id => this.notifyLinkStatus(id));
  }

  // ─── Arrow redraws ─────────────────────────────────────────────────────────

  private scheduleRedraw(): void {
    if (this.redrawScheduled) return;
    this.redrawScheduled = true;
    requestAnimationFrame(() => {
      this.redrawScheduled = false;
      this.overlay.redrawAll(
        this.links,
        id => this.getWrapperEl(id),
        link => this.getArrowMeta(link)
      );
    });
  }

  // ─── Event routing helpers ─────────────────────────────────────────────────

  private resolveSourceInstanceId(event: Event): string | null {
    // Walk the event path to find the first element that matches a known wrapper
    for (const node of event.composedPath()) {
      if (!(node instanceof HTMLElement)) continue;
      const id = this.wrapperToInstanceId.get(node);
      if (id !== undefined) return id;
    }
    return null;
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  public destroy(): void {
    this.overlay.destroy();
  }
}
