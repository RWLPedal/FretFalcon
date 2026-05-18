// ts/floating_views/link_arrow.ts
// Owns a single SVG arrow group and its hover tooltip.
// Extracted from LinkOverlay so metadata-aware rendering can live here.

import { HandleSide, LinkRecord, SignalKind, DriveSignal } from './link_types';

const SVG_NS = 'http://www.w3.org/2000/svg';

// When true, non-matching signal kinds are shown dim alongside the bold matched ones.
const DEBUG_SHOW_ALL_SIGNAL_KINDS = true;

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

function makeDeleteButton(
  center: { x: number; y: number },
  linkId: string,
  onDelete: (id: string) => void
): SVGForeignObjectElement {
  const size = 20;
  const fo = document.createElementNS(SVG_NS, 'foreignObject') as SVGForeignObjectElement;
  fo.setAttribute('x', String(center.x - size / 2));
  fo.setAttribute('y', String(center.y - size / 2));
  fo.setAttribute('width', String(size));
  fo.setAttribute('height', String(size));
  fo.setAttribute('class', 'link-delete-btn-fo');

  const btn = document.createElement('button');
  btn.className = 'link-delete-btn';
  btn.textContent = '×';
  btn.title = 'Remove link';
  btn.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    onDelete(linkId);
  });
  fo.appendChild(btn);
  return fo;
}

// ─── Tooltip helpers ──────────────────────────────────────────────────────────

function signalDisplayValue(signals: DriveSignal[], kind: SignalKind): string | null {
  const s = signals.find(sig => sig.kind === kind);
  if (!s) return null;
  if (s.kind === SignalKind.Tempo) return `${Math.round(s.bpm)} BPM`;
  if (s.kind === SignalKind.Chord) return s.rootNote || null;
  if (s.kind === SignalKind.Key)   return `${s.rootNote} ${s.keyType}`;
  return null;
}

// ─── LinkArrow ────────────────────────────────────────────────────────────────

export class LinkArrow {
  readonly svgGroup: SVGGElement;
  private tooltip: HTMLElement;
  private getMeta: () => ArrowMeta;
  private src: { x: number; y: number };
  private sourceHandle: HandleSide;

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
    this.src = src;
    this.sourceHandle = link.sourceHandle;

    const cp1 = controlPoint(src, link.sourceHandle);
    const cp2 = controlPoint(tgt, link.targetHandle);
    const mid = bezierMidpoint(src, cp1, cp2, tgt);
    const d = `M${src.x},${src.y} C${cp1.x},${cp1.y} ${cp2.x},${cp2.y} ${tgt.x},${tgt.y}`;

    // ── SVG group ────────────────────────────────────────────────────────────
    const g = document.createElementNS(SVG_NS, 'g') as SVGGElement;
    g.dataset.linkId = link.id;
    g.setAttribute('class', 'link-arrow-group');

    const path = document.createElementNS(SVG_NS, 'path') as SVGPathElement;
    path.setAttribute('d', d);
    path.setAttribute('class', 'link-arrow-path');
    g.appendChild(path);

    g.appendChild(makeArrowhead(tgt, link.targetHandle));

    const hitPath = document.createElementNS(SVG_NS, 'path') as SVGPathElement;
    hitPath.setAttribute('d', d);
    hitPath.setAttribute('class', 'link-arrow-hit');
    g.appendChild(hitPath);

    g.appendChild(makeDeleteButton(mid, link.id, onDelete));

    this.svgGroup = g;
    svg.appendChild(g);

    // ── Tooltip ──────────────────────────────────────────────────────────────
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'link-signal-tooltip';
    container.appendChild(this.tooltip);

    g.addEventListener('mouseenter', () => this.showTooltip());
    g.addEventListener('mouseleave', () => this.hideTooltip());
  }

  // ── Tooltip rendering ─────────────────────────────────────────────────────

  private showTooltip(): void {
    if (this.tooltip.classList.contains('is-visible')) return;
    this.renderContent();
    this.positionTooltip();
    this.tooltip.classList.add('is-visible');
  }

  private positionTooltip(): void {
    const { x, y } = this.src;
    this.tooltip.style.left = `${x}px`;
    this.tooltip.style.top  = `${y}px`;
    switch (this.sourceHandle) {
      case 'right':  this.tooltip.style.transform = 'translateY(-50%)'; break;
      case 'left':   this.tooltip.style.transform = 'translate(-100%, -50%)'; break;
      case 'top':    this.tooltip.style.transform = 'translate(-50%, -100%)'; break;
      case 'bottom': this.tooltip.style.transform = 'translateX(-50%)'; break;
    }
  }

  private hideTooltip(): void {
    this.tooltip.classList.remove('is-visible');
  }

  private renderContent(): void {
    const { emittedKinds, acceptedKinds, lastSignals } = this.getMeta();
    this.tooltip.innerHTML = '';

    const matched      = emittedKinds.filter(k => acceptedKinds.includes(k));
    const emittedOnly  = emittedKinds.filter(k => !acceptedKinds.includes(k));
    const acceptedOnly = acceptedKinds.filter(k => !emittedKinds.includes(k));

    for (const kind of matched) {
      const value = signalDisplayValue(lastSignals, kind);
      const row = document.createElement('div');
      row.className = 'link-signal-row link-signal-matched';
      row.textContent = value ? `${kind} → ${value}` : `${kind} →`;
      this.tooltip.appendChild(row);
    }

    if (DEBUG_SHOW_ALL_SIGNAL_KINDS) {
      for (const kind of emittedOnly) {
        const row = document.createElement('div');
        row.className = 'link-signal-row link-signal-emitted-only';
        row.textContent = `${kind} →`;
        this.tooltip.appendChild(row);
      }
      for (const kind of acceptedOnly) {
        const row = document.createElement('div');
        row.className = 'link-signal-row link-signal-accepted-only';
        row.textContent = `→ ${kind}`;
        this.tooltip.appendChild(row);
      }
    }

    if (this.tooltip.children.length === 0) {
      const row = document.createElement('div');
      row.className = 'link-signal-row link-signal-no-data';
      row.textContent = 'No signals';
      this.tooltip.appendChild(row);
    }
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  destroy(): void {
    this.svgGroup.remove();
    this.tooltip.remove();
  }
}
