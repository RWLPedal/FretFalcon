// ts/floating_views/link_overlay.ts
// Renders connection-point handles as SVG elements and manages arrow instances.

import { HandleSide, LinkRecord } from './link_types';
import { LinkArrow, ArrowMeta } from './link_arrow';

const SVG_NS = 'http://www.w3.org/2000/svg';
const HANDLE_RADIUS = 6;

interface DragState {
  sourceInstanceId: string;
  sourceHandle: HandleSide;
}

export class LinkOverlay {
  private svg: SVGSVGElement;
  private container: HTMLElement;

  // Called when the user completes a drag from one handle to another window
  public onLinkCreated:
    | ((sourceId: string, sourceHandle: HandleSide, targetId: string, targetHandle: HandleSide) => void)
    | null = null;

  // Called when the user clicks the delete button on an arrow
  public onLinkDeleted: ((linkId: string) => void) | null = null;

  private dragState: DragState | null = null;
  private provisionalLine: SVGLineElement | null = null;

  // Registry of all known wrapper elements (populated by LinkManager)
  private wrapperEls = new Map<string, HTMLElement>();

  // Which instanceId is currently hovered (for handle visibility)
  private hoveredInstanceId: string | null = null;

  // Active arrow instances — destroyed and recreated on each redrawAll
  private arrows: LinkArrow[] = [];

  constructor(container: HTMLElement) {
    this.container = container;

    this.svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    this.svg.id = 'link-overlay-svg';
    this.svg.setAttribute('xmlns', SVG_NS);
    container.appendChild(this.svg);

    // Track which wrapper the mouse is over to show/hide handles
    container.addEventListener('mousemove', this.onContainerMouseMove);

    // Global handlers for drag
    document.addEventListener('mousemove', this.onDocMouseMove);
    document.addEventListener('mouseup', this.onDocMouseUp);
  }

  // ─── Wrapper registration ──────────────────────────────────────────────────

  public registerWrapper(instanceId: string, wrapperEl: HTMLElement): void {
    this.wrapperEls.set(instanceId, wrapperEl);
  }

  public unregisterWrapper(instanceId: string): void {
    this.wrapperEls.delete(instanceId);
    if (this.hoveredInstanceId === instanceId) this.hoveredInstanceId = null;
  }

  // ─── Main redraw ───────────────────────────────────────────────────────────

  public redrawAll(
    links: LinkRecord[],
    getEl: (instanceId: string) => HTMLElement | null,
    getMeta: (link: LinkRecord) => ArrowMeta
  ): void {
    // Destroy old arrows (each removes its SVG group and tooltip div)
    this.arrows.forEach(a => a.destroy());
    this.arrows = [];

    // Clear remaining SVG content (handles)
    while (this.svg.firstChild) this.svg.removeChild(this.svg.firstChild);

    const containerRect = this.container.getBoundingClientRect();

    // Draw handles for all registered wrappers
    this.wrapperEls.forEach((wrapperEl, instanceId) => {
      const isHovered = instanceId === this.hoveredInstanceId;
      this.drawHandles(wrapperEl, instanceId, containerRect, isHovered);
    });

    // Create arrows
    for (const link of links) {
      const sourceEl = getEl(link.sourceInstanceId);
      const targetEl = getEl(link.targetInstanceId);
      if (!sourceEl || !targetEl) continue;

      const src = this.getHandleCenter(sourceEl, link.sourceHandle, containerRect);
      const tgt = this.getHandleCenter(targetEl, link.targetHandle, containerRect);
      if (!src || !tgt) continue;

      const captured = link; // avoid closure over loop variable
      const arrow = new LinkArrow(
        captured, src, tgt,
        this.svg, this.container,
        () => getMeta(captured),
        (id) => this.onLinkDeleted?.(id)
      );
      this.arrows.push(arrow);
    }

    // Re-add provisional line if mid-drag
    if (this.provisionalLine) this.svg.appendChild(this.provisionalLine);
  }

  // ─── Handle drawing ────────────────────────────────────────────────────────

  private drawHandles(
    wrapperEl: HTMLElement,
    instanceId: string,
    containerRect: DOMRect,
    visible: boolean
  ): void {
    const sides: HandleSide[] = ['top', 'bottom', 'left', 'right'];
    for (const side of sides) {
      const center = this.getHandleCenter(wrapperEl, side, containerRect);
      if (!center) continue;

      // Group wraps circle + hit so CSS :hover on the group lights up the circle
      // even when the mouse is over the expanded transparent hit area.
      const g = document.createElementNS(SVG_NS, 'g') as SVGGElement;
      g.setAttribute('class', 'link-handle-group');

      const circle = document.createElementNS(SVG_NS, 'circle') as SVGCircleElement;
      circle.setAttribute('cx', String(center.x));
      circle.setAttribute('cy', String(center.y));
      circle.setAttribute('r', String(HANDLE_RADIUS));
      circle.setAttribute('class', visible ? 'link-handle link-handle--visible' : 'link-handle');
      circle.dataset.instanceId = instanceId;
      circle.dataset.side = side;

      // Expanded hit area with a transparent larger circle
      const hit = document.createElementNS(SVG_NS, 'circle') as SVGCircleElement;
      hit.setAttribute('cx', String(center.x));
      hit.setAttribute('cy', String(center.y));
      hit.setAttribute('r', String(HANDLE_RADIUS + 8));
      hit.setAttribute('class', 'link-handle-hit');
      hit.dataset.instanceId = instanceId;
      hit.dataset.side = side;
      hit.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        this.onHandleMouseDown(e, instanceId, side, center);
      });

      g.appendChild(circle);
      g.appendChild(hit);
      this.svg.appendChild(g);
    }
  }

  // ─── Handle center ─────────────────────────────────────────────────────────

  private getHandleCenter(
    wrapperEl: HTMLElement,
    side: HandleSide,
    containerRect: DOMRect
  ): { x: number; y: number } | null {
    const rect = wrapperEl.getBoundingClientRect();
    const x = side === 'left'   ? rect.left
             : side === 'right'  ? rect.right
             : rect.left + rect.width / 2;
    const y = side === 'top'    ? rect.top
             : side === 'bottom' ? rect.bottom
             : rect.top + rect.height / 2;
    return {
      x: x - containerRect.left,
      y: y - containerRect.top,
    };
  }

  // ─── Handle hover tracking ─────────────────────────────────────────────────

  private onContainerMouseMove = (e: MouseEvent): void => {
    // Find which wrapper (if any) the mouse is over — even during drag (to show target handles)
    let found: string | null = null;
    this.wrapperEls.forEach((wrapperEl, instanceId) => {
      const rect = wrapperEl.getBoundingClientRect();
      if (
        e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top  && e.clientY <= rect.bottom
      ) {
        found = instanceId;
      }
    });

    // Fallback: mouse may be over a hit area that extends beyond the wrapper rect
    if (!found) {
      const hit = document.elementsFromPoint(e.clientX, e.clientY)
        .find(el => el.classList.contains('link-handle-hit')) as SVGElement | undefined;
      if (hit?.dataset.instanceId) found = hit.dataset.instanceId;
    }

    if (found !== this.hoveredInstanceId) {
      this.hoveredInstanceId = found;
      this.updateHandleVisibility();
    }
  };

  private updateHandleVisibility(): void {
    this.svg.querySelectorAll('.link-handle').forEach(el => {
      const id = (el as SVGElement).dataset.instanceId;
      el.classList.toggle('link-handle--visible', id === this.hoveredInstanceId);
    });
  }

  // ─── Drag-to-create ────────────────────────────────────────────────────────

  private onHandleMouseDown(
    e: MouseEvent,
    instanceId: string,
    side: HandleSide,
    center: { x: number; y: number }
  ): void {
    e.preventDefault();
    this.dragState = { sourceInstanceId: instanceId, sourceHandle: side };

    const line = document.createElementNS(SVG_NS, 'line') as SVGLineElement;
    line.setAttribute('class', 'link-provisional');
    line.setAttribute('x1', String(center.x));
    line.setAttribute('y1', String(center.y));
    line.setAttribute('x2', String(center.x));
    line.setAttribute('y2', String(center.y));
    this.provisionalLine = line;
    this.svg.appendChild(line);
  }

  private onDocMouseMove = (e: MouseEvent): void => {
    if (!this.dragState || !this.provisionalLine) return;
    const rect = this.container.getBoundingClientRect();
    this.provisionalLine.setAttribute('x2', String(e.clientX - rect.left));
    this.provisionalLine.setAttribute('y2', String(e.clientY - rect.top));
  };

  private onDocMouseUp = (e: MouseEvent): void => {
    if (!this.dragState) return;

    // elementsFromPoint finds hit targets even when floating windows sit on top of the SVG
    const hit = document.elementsFromPoint(e.clientX, e.clientY)
      .find(el => el.classList.contains('link-handle-hit')) as SVGElement | undefined;

    if (hit) {
      const targetInstanceId = hit.dataset.instanceId ?? '';
      const targetHandle = (hit.dataset.side ?? 'top') as HandleSide;
      if (targetInstanceId && targetInstanceId !== this.dragState.sourceInstanceId) {
        this.onLinkCreated?.(
          this.dragState.sourceInstanceId,
          this.dragState.sourceHandle,
          targetInstanceId,
          targetHandle
        );
      }
    }

    this.provisionalLine?.remove();
    this.provisionalLine = null;
    this.dragState = null;
  };

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  public destroy(): void {
    this.arrows.forEach(a => a.destroy());
    this.arrows = [];
    this.container.removeEventListener('mousemove', this.onContainerMouseMove);
    document.removeEventListener('mousemove', this.onDocMouseMove);
    document.removeEventListener('mouseup', this.onDocMouseUp);
    this.svg.remove();
  }
}
