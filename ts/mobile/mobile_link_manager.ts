// ts/mobile/mobile_link_manager.ts
//
// Simplified linear signal router for mobile. The desktop LinkManager supports
// arbitrary graph connections with visual arrows; mobile only needs a chain:
// view[0] → view[1] → view[2]. Pairs are tracked by index; pair[i] = true
// means view[i] drives view[i+1].

import { DriveSignal, SignalKind, GrooveSignal, PlaySignal, SignalState } from '../panels/link_types';
import { getDriveSourceDescriptor } from '../panels/drive_registry';

// Minimal view shape needed for signal routing — avoids a circular import with
// mobile_view_manager.ts which also imports this class.
interface RoutableView {
  instanceId: string;
  viewId: string;
  featureTypeName?: string;
  contentEl: HTMLDivElement;
}

export class MobileLinkManager {
  private linkedPairs: boolean[] = [];
  private lastSourceSignals = new Map<string, DriveSignal[]>();

  constructor(
    private viewAreaEl: HTMLElement,
    private getViews: () => RoutableView[]
  ) {
    this._wireEvents();
  }

  // ─── Event wiring ────────────────────────────────────────────────────────────

  private _wireEvents(): void {
    const ea = this.viewAreaEl;

    // Events whose signals are extracted via the drive registry descriptor.
    const handleDescriptor = (e: Event) => {
      const instanceId = this._resolveSourceInstanceId(e);
      if (!instanceId) return;
      const view = this.getViews().find(v => v.instanceId === instanceId);
      if (!view) return;
      const descriptor = getDriveSourceDescriptor(view.viewId, view.featureTypeName);
      if (!descriptor) return;
      this._routeSignals(instanceId, descriptor.extractSignals((e as CustomEvent).detail));
    };

    ea.addEventListener('backing-track-tick', handleDescriptor);
    ea.addEventListener('metronome-tempo-changed', handleDescriptor);
    ea.addEventListener('cof-key-selected', handleDescriptor);
    ea.addEventListener('schedule-feature-changed', handleDescriptor);

    // Configurable features dispatch feature-state-changed with a featureTypeName.
    ea.addEventListener('feature-state-changed', (e: Event) => {
      const detail = (e as CustomEvent).detail as { featureTypeName?: string } | null;
      if (!detail?.featureTypeName) return;
      const instanceId = this._resolveSourceInstanceId(e);
      if (!instanceId) return;
      const view = this.getViews().find(v => v.instanceId === instanceId);
      if (!view) return;
      const descriptor = getDriveSourceDescriptor(view.viewId, detail.featureTypeName);
      if (!descriptor) return;
      this._routeSignals(instanceId, descriptor.extractSignals(detail));
    });

    // Relay signals forwarded by intermediate features.
    ea.addEventListener('feature-signal-relay', (e: Event) => {
      const detail = (e as CustomEvent<{ signal?: DriveSignal }>).detail;
      if (!detail?.signal) return;
      const instanceId = this._resolveSourceInstanceId(e);
      if (instanceId) this._routeSignals(instanceId, [detail.signal]);
    });

    // Per-beat groove ticks are routed without touching the signal cache.
    ea.addEventListener('groove-tick', (e: Event) => {
      const instanceId = this._resolveSourceInstanceId(e);
      if (!instanceId) return;
      const detail = (e as CustomEvent).detail;
      if (typeof detail?.bpm !== 'number') return;
      const signal: GrooveSignal = {
        kind: SignalKind.Groove,
        bpm: detail.bpm,
        timeSig: detail.timeSig ?? { beats: 4, division: 4 },
        swing: detail.swing ?? 0,
        beat: typeof detail.beat === 'number' ? detail.beat : undefined,
      };
      this._deliverToNext(instanceId, [signal]);
    });

    // Transport play/stop signals are not cached — no stale delivery to new links.
    ea.addEventListener('transport-changed', (e: Event) => {
      const instanceId = this._resolveSourceInstanceId(e);
      if (!instanceId) return;
      const detail = (e as CustomEvent).detail;
      if (typeof detail?.playing !== 'boolean') return;
      const signal: PlaySignal = { kind: SignalKind.Play, playing: detail.playing };
      this._deliverToNext(instanceId, [signal]);
    });
  }

  private _resolveSourceInstanceId(event: Event): string | null {
    for (const node of event.composedPath()) {
      if (node instanceof HTMLElement && node.dataset.instanceId) return node.dataset.instanceId;
    }
    return null;
  }

  // ─── Signal routing ──────────────────────────────────────────────────────────

  private _routeSignals(sourceInstanceId: string, signals: DriveSignal[]): void {
    if (!signals.length) return;
    // Merge into cache: current and next signals of the same kind coexist, and
    // Groove config updates don't evict cached Chord/Key signals.
    const existing = this.lastSourceSignals.get(sourceInstanceId) ?? [];
    const newKeys = new Set(signals.map(s => `${s.kind}:${s.state ?? SignalState.Current}`));
    const merged = [
      ...existing.filter(s => !newKeys.has(`${s.kind}:${s.state ?? SignalState.Current}`)),
      ...signals,
    ];
    this.lastSourceSignals.set(sourceInstanceId, merged);
    this._deliverToNext(sourceInstanceId, signals);
  }

  private _deliverToNext(sourceInstanceId: string, signals: DriveSignal[]): void {
    const views = this.getViews();
    const srcIdx = views.findIndex(v => v.instanceId === sourceInstanceId);
    if (srcIdx === -1 || !this.linkedPairs[srcIdx]) return;
    const target = views[srcIdx + 1];
    if (!target) return;
    for (const signal of signals) {
      target.contentEl.dispatchEvent(new CustomEvent('drive-signal', {
        bubbles: true,
        detail: { signal, linkId: `mobile-link-${srcIdx}` },
      }));
    }
  }

  private _redeliverCached(pairIndex: number): void {
    const views = this.getViews();
    const source = views[pairIndex];
    const target = views[pairIndex + 1];
    if (!source || !target) return;
    const cached = this.lastSourceSignals.get(source.instanceId);
    if (!cached?.length) return;
    for (const signal of cached) {
      target.contentEl.dispatchEvent(new CustomEvent('drive-signal', {
        bubbles: true,
        detail: { signal, linkId: `mobile-link-${pairIndex}` },
      }));
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────────────

  public toggleLink(pairIndex: number): void {
    this.linkedPairs[pairIndex] = !this.linkedPairs[pairIndex];
    const views = this.getViews();
    const target = views[pairIndex + 1];
    if (target) {
      this.notifyLinkStatus(target.instanceId);
      if (this.linkedPairs[pairIndex]) this._redeliverCached(pairIndex);
    }
  }

  public isLinked(pairIndex: number): boolean {
    return !!this.linkedPairs[pairIndex];
  }

  /** Call after a view has been pushed onto the views array. */
  public onViewAdded(): void {
    const n = this.getViews().length;
    while (this.linkedPairs.length < Math.max(0, n - 1)) this.linkedPairs.push(false);
    if (n > 0) this.notifyLinkStatus(this.getViews()[n - 1].instanceId);
  }

  /** Call BEFORE the view at removedIdx is spliced out of the views array. */
  public onViewRemoved(removedIdx: number): void {
    const oldPairsLen = this.linkedPairs.length; // n-1 pairs for n views
    const oldViewCount = oldPairsLen + 1;
    const newPairs: boolean[] = [];

    for (let i = 0; i < oldPairsLen; i++) {
      if (i === removedIdx - 1) {
        // Pair between view[removedIdx-1] and view[removedIdx]. Since view[removedIdx]
        // is gone, replace with a new (false) pair only if both neighbours still exist.
        if (removedIdx > 0 && removedIdx < oldViewCount - 1) newPairs.push(false);
      } else if (i === removedIdx) {
        // Pair between view[removedIdx] and view[removedIdx+1] — drop it.
      } else {
        newPairs.push(this.linkedPairs[i]);
      }
    }
    this.linkedPairs = newPairs;
    this.notifyAllLinkStatuses();
  }

  /** Re-notify link status and redeliver cached signals after a view's content is recreated. */
  public refreshForInstance(instanceId: string): void {
    this.notifyLinkStatus(instanceId);
    const views = this.getViews();
    const idx = views.findIndex(v => v.instanceId === instanceId);
    if (idx > 0 && this.linkedPairs[idx - 1]) this._redeliverCached(idx - 1);
  }

  public notifyLinkStatus(instanceId: string): void {
    const views = this.getViews();
    const idx = views.findIndex(v => v.instanceId === instanceId);
    if (idx === -1) return;
    const hasIncoming = idx > 0 && !!this.linkedPairs[idx - 1];
    views[idx].contentEl.dispatchEvent(new CustomEvent('link-status-changed', {
      bubbles: true,
      detail: { hasIncomingLinks: hasIncoming, hasNextSignals: false },
    }));
  }

  public notifyAllLinkStatuses(): void {
    for (const view of this.getViews()) this.notifyLinkStatus(view.instanceId);
  }

  public getLinkedPairs(): boolean[] {
    return [...this.linkedPairs];
  }

  /** Apply saved pairs, clamping/padding to exactly viewCount-1 entries. */
  public setLinkedPairs(pairs: boolean[], viewCount: number): void {
    const targetLen = Math.max(0, viewCount - 1);
    this.linkedPairs = pairs.slice(0, targetLen);
    while (this.linkedPairs.length < targetLen) this.linkedPairs.push(false);
    this.notifyAllLinkStatuses();
  }
}
