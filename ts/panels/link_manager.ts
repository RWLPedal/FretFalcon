// ts/floating_views/link_manager.ts
import { HandleSide, LinkRecord, DriveSignal } from './link_types';
import { LinkOverlay } from './link_overlay';
import { ArrowMeta } from './link_arrow';
import {
  getDriveSourceDescriptor,
  getDriveTargetSlots,
  getFeatureTypeNameByViewId,
} from './drive_registry';

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

  constructor(
    private viewAreaEl: HTMLElement,
    private getWrapperEl: (instanceId: string) => HTMLElement | null,
    getViewId: (instanceId: string) => string | null,
    private getContentEl: (instanceId: string) => HTMLElement | null = () => null,
    getFeatureTypeName: ((instanceId: string) => string | null) | null = null
  ) {
    this.instanceIdToViewId = getViewId;
    this.instanceIdToFeatureTypeName = getFeatureTypeName;
    this.overlay = new LinkOverlay(viewAreaEl);

    this.overlay.onLinkCreated = (srcId, srcHandle, tgtId, tgtHandle) => {
      this.addLink(srcId, srcHandle, tgtId, tgtHandle);
    };
    this.overlay.onLinkDeleted = (linkId) => {
      this.removeLink(linkId);
    };

    // Listen for backing-track-tick (real-time per-measure chord signal)
    viewAreaEl.addEventListener('backing-track-tick', (e: Event) => {
      console.log('[LM] backing-track-tick received');
      const instanceId = this.resolveSourceInstanceId(e);
      console.log('[LM] resolved sourceInstanceId:', instanceId);
      if (!instanceId) return;
      const viewId = this.instanceIdToViewId(instanceId);
      console.log('[LM] viewId:', viewId);
      if (!viewId) return;
      const descriptor = getDriveSourceDescriptor(viewId);
      console.log('[LM] descriptor:', descriptor);
      if (!descriptor) return;
      const signals = descriptor.extractSignals((e as CustomEvent).detail);
      console.log('[LM] signals:', signals, 'links:', this.links);
      this.routeSignals(instanceId, signals);
    });

    // Listen for metronome-tempo-changed (real-time BPM signal from MetronomeView)
    viewAreaEl.addEventListener('metronome-tempo-changed', (e: Event) => {
      const instanceId = this.resolveSourceInstanceId(e);
      if (!instanceId) return;
      const viewId = this.instanceIdToViewId(instanceId);
      if (!viewId) return;
      const descriptor = getDriveSourceDescriptor(viewId);
      if (!descriptor) return;
      const signals = descriptor.extractSignals((e as CustomEvent).detail);
      this.routeSignals(instanceId, signals);
    });

    // Listen for feature-state-changed (for configurable features as sources)
    viewAreaEl.addEventListener('feature-state-changed', (e: Event) => {
      const detail = (e as CustomEvent).detail as { featureTypeName?: string } | null;
      if (!detail?.featureTypeName) return;
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
    viewAreaEl.addEventListener('schedule-feature-changed', (e: Event) => {
      const instanceId = this.resolveSourceInstanceId(e);
      if (!instanceId) return;
      const viewId = this.instanceIdToViewId(instanceId);
      if (!viewId) return;
      const descriptor = getDriveSourceDescriptor(viewId);
      if (!descriptor) return;
      const signals = descriptor.extractSignals((e as CustomEvent).detail);
      this.routeSignals(instanceId, signals);
    });

    // Relay signals forwarded by features (e.g. MultiSelectFretboard driven update → ChordDiagram)
    viewAreaEl.addEventListener('feature-signal-relay', (e: Event) => {
      const detail = (e as CustomEvent<{ featureTypeName?: string; signal?: DriveSignal }>).detail;
      if (!detail?.signal) return;
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
  }

  public onWindowDestroyed(instanceId: string): void {
    const wrapperEl = this.getWrapperEl(instanceId);
    if (wrapperEl) {
      this.overlay.unregisterWrapper(instanceId);
      this.wrapperToInstanceId.delete(wrapperEl);
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
    this.lastSourceSignals.set(sourceInstanceId, signals);
    const outgoing = this.links.filter(l => l.sourceInstanceId === sourceInstanceId);
    outgoing.forEach(link => this.routeSignalsToTarget(link, signals));
  }

  private routeSignalsToTarget(link: LinkRecord, signals: DriveSignal[]): void {
    const targetEl = this.getContentEl(link.targetInstanceId) ?? this.getWrapperEl(link.targetInstanceId);
    if (!targetEl) return;
    signals.forEach(signal => {
      targetEl.dispatchEvent(new CustomEvent('drive-signal', {
        bubbles: true,
        detail: { signal, linkId: link.id },
      }));
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
    const targetEl = this.getContentEl(instanceId) ?? this.getWrapperEl(instanceId);
    if (!targetEl) return;
    const hasIncoming = this.links.some(l => l.targetInstanceId === instanceId);
    targetEl.dispatchEvent(new CustomEvent('link-status-changed', {
      bubbles: true,
      detail: { hasIncomingLinks: hasIncoming },
    }));
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
