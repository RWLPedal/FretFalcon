// ts/panels/link_arrow.ts
// Owns a single SVG arrow group and its hover tooltip.
// Extracted from LinkOverlay so metadata-aware rendering can live here.

import { HandleSide, LinkRecord, SignalKind, SignalState, DriveSignal, SIGNAL_KIND_ICON, DiatonicMode } from './link_types';
import { DIATONIC_MODE_LABELS } from '../music/music_types';

const SVG_NS = 'http://www.w3.org/2000/svg';

const DEBUG_SHOW_ALL_SIGNAL_KINDS = false;

export interface ArrowMeta {
  emittedKinds: SignalKind[];
  acceptedKinds: SignalKind[];
  lastSignals: DriveSignal[];
}

// ─── SVG helpers (module-private) ────────────────────────────────────────────

function controlPoint(pt: { x: number; y: number }, side: HandleSide): { x: number; y: number } {
  // The lower the offset, the straighter the curve.
  const offset = 35;
  if (side === 'left')  return { x: pt.x - offset, y: pt.y };
  if (side === 'right') return { x: pt.x + offset, y: pt.y };
  if (side === 'top')   return { x: pt.x, y: pt.y - offset };
  return { x: pt.x, y: pt.y + offset };
}

function bezierMidpoint(
  p0: { x: number; y: number }, p1: { x: number; y: number },
  p2: { x: number; y: number }, p3: { x: number; y: number }
): { x: number; y: number } {
  const t = 0.5, mt = 1 - t;
  return {
    x: mt*mt*mt*p0.x + 3*mt*mt*t*p1.x + 3*mt*t*t*p2.x + t*t*t*p3.x,
    y: mt*mt*mt*p0.y + 3*mt*mt*t*p1.y + 3*mt*t*t*p2.y + t*t*t*p3.y,
  };
}

function makeArrowhead(tip: { x: number; y: number }, side: HandleSide): SVGPolygonElement {
  const s = 9;
  let points: string;
  if (side === 'left')       points = `${tip.x},${tip.y} ${tip.x-s},${tip.y-s/2} ${tip.x-s},${tip.y+s/2}`;
  else if (side === 'right') points = `${tip.x},${tip.y} ${tip.x+s},${tip.y-s/2} ${tip.x+s},${tip.y+s/2}`;
  else if (side === 'top')   points = `${tip.x},${tip.y} ${tip.x-s/2},${tip.y-s} ${tip.x+s/2},${tip.y-s}`;
  else                       points = `${tip.x},${tip.y} ${tip.x-s/2},${tip.y+s} ${tip.x+s/2},${tip.y+s}`;
  const poly = document.createElementNS(SVG_NS, 'polygon') as SVGPolygonElement;
  poly.setAttribute('points', points);
  poly.setAttribute('class', 'link-arrow-head');
  return poly;
}

function buildIconBadges(
  mid: { x: number; y: number },
  matchedKinds: SignalKind[]
): SVGGElement {
  const g = document.createElementNS(SVG_NS, 'g') as SVGGElement;
  g.setAttribute('class', 'link-arrow-icons');
  const n = matchedKinds.length;
  const w = n * 18 + 8;
  const h = 18;

  const bg = document.createElementNS(SVG_NS, 'rect') as SVGRectElement;
  bg.setAttribute('x', String(mid.x - w / 2));
  bg.setAttribute('y', String(mid.y - h / 2));
  bg.setAttribute('width', String(w));
  bg.setAttribute('height', String(h));
  bg.setAttribute('rx', '4');
  bg.setAttribute('class', 'link-arrow-icon-bg');
  g.appendChild(bg);

  for (let i = 0; i < n; i++) {
    const offsetX = (i - (n - 1) / 2) * 18;
    const text = document.createElementNS(SVG_NS, 'text') as SVGTextElement;
    text.setAttribute('x', String(mid.x + offsetX));
    text.setAttribute('y', String(mid.y));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    text.setAttribute('class', 'link-arrow-icon');
    text.textContent = SIGNAL_KIND_ICON[matchedKinds[i]];
    g.appendChild(text);
  }
  return g;
}

// ─── Tooltip helpers ──────────────────────────────────────────────────────────

function signalValue(s: DriveSignal): string | null {
  if (s.kind === SignalKind.Groove) return `${Math.round(s.bpm)} BPM`;
  if (s.kind === SignalKind.Chord) return s.rootNote || null;
  if (s.kind === SignalKind.Key)   return `${s.rootNote} ${DIATONIC_MODE_LABELS[s.scaleKey as DiatonicMode] ?? s.scaleKey}`;
  if (s.kind === SignalKind.Play)  return s.playing ? 'On' : 'Off';
  return null;
}

function signalsByKind(signals: DriveSignal[], kind: SignalKind): { current: DriveSignal | null; next: DriveSignal | null } {
  const current = signals.find(s => s.kind === kind && (s.state ?? SignalState.Current) === SignalState.Current) ?? null;
  const next    = signals.find(s => s.kind === kind && s.state === SignalState.Next) ?? null;
  return { current, next };
}

// ─── LinkArrow ────────────────────────────────────────────────────────────────

export class LinkArrow {
  readonly svgGroup: SVGGElement;
  private tooltip: HTMLElement;
  private tooltipContent: HTMLDivElement;
  private getMeta: () => ArrowMeta;
  private mid: { x: number; y: number };
  private linkId: string;
  private onDelete: (id: string) => void;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    link: LinkRecord,
    src: { x: number; y: number },
    tgt: { x: number; y: number },
    svg: SVGSVGElement,
    container: HTMLElement,
    getMeta: () => ArrowMeta,
    onDelete: (id: string) => void
  ) {
    this.getMeta = getMeta;
    this.linkId  = link.id;
    this.onDelete = onDelete;

    const cp1 = controlPoint(src, link.sourceHandle);
    const cp2 = controlPoint(tgt, link.targetHandle);
    this.mid   = bezierMidpoint(src, cp1, cp2, tgt);
    const d    = `M${src.x},${src.y} C${cp1.x},${cp1.y} ${cp2.x},${cp2.y} ${tgt.x},${tgt.y}`;

    // ── SVG group ────────────────────────────────────────────────────────────
    const g = document.createElementNS(SVG_NS, 'g') as SVGGElement;
    g.dataset.linkId = link.id;
    g.setAttribute('class', 'link-arrow-group');

    const path = document.createElementNS(SVG_NS, 'path') as SVGPathElement;
    path.setAttribute('d', d);
    path.setAttribute('class', 'link-arrow-path');
    g.appendChild(path);

    g.appendChild(makeArrowhead(tgt, link.targetHandle));

    // Persistent icon badges for matched signals (between path and hit area)
    const { emittedKinds, acceptedKinds } = getMeta();
    const matched = emittedKinds.filter(k => acceptedKinds.includes(k));
    if (matched.length > 0) {
      g.appendChild(buildIconBadges(this.mid, matched));
    }

    const hitPath = document.createElementNS(SVG_NS, 'path') as SVGPathElement;
    hitPath.setAttribute('d', d);
    hitPath.setAttribute('class', 'link-arrow-hit');
    g.appendChild(hitPath);

    this.svgGroup = g;
    svg.appendChild(g);

    // ── Tooltip ──────────────────────────────────────────────────────────────
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'link-signal-tooltip';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'link-signal-close-btn';
    closeBtn.textContent = '×';
    closeBtn.title = 'Remove link';
    closeBtn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.cancelHide();
      this.tooltip.classList.remove('is-visible');
      this.onDelete(this.linkId);
    });
    this.tooltip.appendChild(closeBtn);

    this.tooltipContent = document.createElement('div');
    this.tooltipContent.className = 'link-signal-content';
    this.tooltip.appendChild(this.tooltipContent);

    container.appendChild(this.tooltip);

    g.addEventListener('mouseenter', () => { this.cancelHide(); this.showTooltip(); });
    g.addEventListener('mouseleave', () => this.scheduleHide());
    this.tooltip.addEventListener('mouseenter', () => this.cancelHide());
    this.tooltip.addEventListener('mouseleave', () => this.scheduleHide());
  }

  // ── Hide timer helpers ────────────────────────────────────────────────────

  private scheduleHide(): void {
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      this.tooltip.classList.remove('is-visible');
    }, 350);
  }

  private cancelHide(): void {
    if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
  }

  // ── Tooltip rendering ─────────────────────────────────────────────────────

  private showTooltip(): void {
    if (this.tooltip.classList.contains('is-visible')) return;
    this.renderContent();
    this.positionTooltip();
    this.tooltip.classList.add('is-visible');
  }

  private positionTooltip(): void {
    this.tooltip.style.left = `${this.mid.x}px`;
    this.tooltip.style.top  = `${this.mid.y}px`;
    this.tooltip.style.transform = 'translate(-50%, -50%)';
  }

  private renderContent(): void {
    const { emittedKinds, acceptedKinds, lastSignals } = this.getMeta();
    this.tooltipContent.innerHTML = '';

    const matched      = emittedKinds.filter(k => acceptedKinds.includes(k));
    const emittedOnly  = emittedKinds.filter(k => !acceptedKinds.includes(k));
    const acceptedOnly = acceptedKinds.filter(k => !emittedKinds.includes(k));

    for (const kind of matched) {
      const { current, next } = signalsByKind(lastSignals, kind);

      if (current) {
        const row = document.createElement('div');
        row.className = 'link-signal-row link-signal-matched';
        const val = signalValue(current);
        row.textContent = val
          ? `${SIGNAL_KIND_ICON[kind]} ${kind} → ${val}`
          : `${SIGNAL_KIND_ICON[kind]} ${kind} →`;
        this.tooltipContent.appendChild(row);
      }

      if (next) {
        const row = document.createElement('div');
        row.className = 'link-signal-row link-signal-matched link-signal-next';
        const val = signalValue(next);
        row.textContent = val
          ? `${SIGNAL_KIND_ICON[kind]} ${kind} → ${val}`
          : `${SIGNAL_KIND_ICON[kind]} ${kind} →`;
        this.tooltipContent.appendChild(row);
      }

      if (!current && !next) {
        const row = document.createElement('div');
        row.className = 'link-signal-row link-signal-matched';
        row.textContent = `${SIGNAL_KIND_ICON[kind]} ${kind} →`;
        this.tooltipContent.appendChild(row);
      }
    }

    if (DEBUG_SHOW_ALL_SIGNAL_KINDS) {
      for (const kind of emittedOnly) {
        const row = document.createElement('div');
        row.className = 'link-signal-row link-signal-emitted-only';
        row.textContent = `${SIGNAL_KIND_ICON[kind]} ${kind} →`;
        this.tooltipContent.appendChild(row);
      }
      for (const kind of acceptedOnly) {
        const row = document.createElement('div');
        row.className = 'link-signal-row link-signal-accepted-only';
        row.textContent = `→ ${SIGNAL_KIND_ICON[kind]} ${kind}`;
        this.tooltipContent.appendChild(row);
      }
    }

    if (this.tooltipContent.children.length === 0) {
      const row = document.createElement('div');
      row.className = 'link-signal-row link-signal-no-data';
      row.textContent = 'No signals';
      this.tooltipContent.appendChild(row);
    }
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  destroy(): void {
    this.cancelHide();
    this.svgGroup.remove();
    this.tooltip.remove();
  }
}

