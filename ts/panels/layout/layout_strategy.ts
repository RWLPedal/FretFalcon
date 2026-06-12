// ts/panels/layout/layout_strategy.ts
// Interfaces for the pluggable layout strategy system.
// Both FloatingLayout (desktop) and TabbedLayout (mobile) implement LayoutStrategy.

export type LayoutKind = 'floating' | 'tabbed';

// ─── Persistence types ─────────────────────────────────────────────────────────

export interface FloatingPerInstance {
  gridPosition: { col: number; row: number };
  gridSize?: { cols: number; rows: number };
  zIndex: number;
}

export interface LayoutData {
  floating?: {
    referenceGrid: { cols: number; rows: number };
    nextZIndex: number;
    perInstance: Record<string, FloatingPerInstance>;
  };
  tabbed?: {
    order: string[];
    activeId?: string;
  };
}

// ─── Chrome ────────────────────────────────────────────────────────────────────

/** Thin layout-specific UI shell returned by createChrome. */
export interface PanelChrome {
  /** Update the title shown in the chrome (wrapper titlebar or tab label). */
  setTitle(title: string): void;
  /** Reflect zoom state on the zoom button (floating only; no-op for tabbed). */
  setZoomActive(active: boolean): void;
  /** The outer wrapper element used for link-handle registration (floating only).
   *  Undefined for TabbedLayout (link editing is desktop-only). */
  readonly wrapperEl?: HTMLElement;
  /** Called after PanelHost re-renders a view into the existing contentEl (e.g.
   *  after rotate or zoom). Floating chrome triggers auto-size; tabbed is a no-op. */
  notifyContentReplaced(forceAutoSize: boolean): void;
  /** Remove the chrome from the DOM. Does NOT destroy the view or its contentEl.
   *  Returns the contentEl so PanelHost can reuse it when switching strategies. */
  destroy(): HTMLElement;
}

// ─── Spawn info ────────────────────────────────────────────────────────────────

export interface PanelSpawnInfo {
  instanceId: string;
  title: string;
  icon?: string;
  /** Already-rendered content element — will be appended inside the chrome. */
  contentEl: HTMLElement;
  collapsed?: boolean;
  zoomActive?: boolean;
  // Sizing hints (used by FloatingLayout; ignored by TabbedLayout)
  defaultWidth?: number;
  defaultHeight?: number;
  minWidth?: number;
  minHeight?: number;
  supportsRotate?: boolean;
  supportsZoom?: boolean;
  supportsConfigToggle?: boolean;
  // Position / size for restore path (FloatingLayout only)
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  zIndex?: number;
  // Callbacks into PanelHost
  onRotate?: () => void;
  onZoom?: () => void;
  onConfigToggle?: () => void;
  onClose?: (instanceId: string) => void;
  onPositionChange?: (x: number, y: number) => void;
  onSave?: () => void;
}

// ─── Strategy ──────────────────────────────────────────────────────────────────

export interface LayoutStrategy {
  readonly kind: LayoutKind;
  /** Mount into the given area element. Must be called before createChrome. */
  mount(area: HTMLElement): void;
  /** Unmount and clean up. Chromes should already have been removed by this point. */
  unmount(): void;
  /** Create chrome for the given instance. The provided contentEl is already
   *  rendered and is appended inside the chrome. Returns the new chrome. */
  createChrome(info: PanelSpawnInfo): PanelChrome;
  /** Focus / bring the given instance into view. */
  focus(instanceId: string): void;
  /** Called on window resize so the strategy can clamp/reflow. */
  handleResize?(): void;
  /** Serialize layout-specific state for persistence. */
  serializeLayout(): LayoutData;
  /** Restore layout-specific state after panels have been created. */
  applyLayoutData(data: LayoutData | undefined): void;
}
