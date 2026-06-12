// ts/panels/layout/tabbed_layout.ts
// Implements LayoutStrategy for the mobile/narrow-viewport tabbed experience.
// One panel visible at a time, tab bar at the bottom, add-panel sheet.
// ~250 LOC. No drag/resize/z-order/link-overlay.

import type { LayoutStrategy, LayoutKind, LayoutData, PanelChrome, PanelSpawnInfo } from './layout_strategy';
import { getNavSectionGroups } from '../../reference_page/nav_registry';
import { getFloatingViewDescriptor } from '../panel_registry';
import type { ViewId } from '../../core/ids';

// ─── TabbedChrome ─────────────────────────────────────────────────────────────

class TabbedChrome implements PanelChrome {
  readonly wrapperEl: undefined = undefined;
  private _contentEl: HTMLElement;
  private _panelEl: HTMLElement;  // the content container in the layout
  private _tabEl: HTMLElement;
  private _tabTitleEl: HTMLElement;

  constructor(
    contentEl: HTMLElement,
    panelEl: HTMLElement,
    tabEl: HTMLElement,
    tabTitleEl: HTMLElement,
  ) {
    this._contentEl = contentEl;
    this._panelEl = panelEl;
    this._tabEl = tabEl;
    this._tabTitleEl = tabTitleEl;
  }

  setTitle(title: string): void {
    this._tabTitleEl.textContent = title;
  }

  setZoomActive(_active: boolean): void { /* no-op in tabbed mode */ }

  notifyContentReplaced(_forceAutoSize: boolean): void { /* no-op in tabbed mode */ }

  destroy(): HTMLElement {
    // Detach contentEl from panel container
    if (this._contentEl.parentNode === this._panelEl) {
      this._panelEl.removeChild(this._contentEl);
    }
    this._panelEl.remove();
    this._tabEl.remove();
    return this._contentEl;
  }
}

// ─── TabbedLayout ─────────────────────────────────────────────────────────────

export class TabbedLayout implements LayoutStrategy {
  readonly kind: LayoutKind = 'tabbed';

  private area: HTMLElement | null = null;
  private layoutEl: HTMLElement | null = null;
  private contentAreaEl: HTMLElement | null = null;
  private tabBarEl: HTMLElement | null = null;
  private addSheetEl: HTMLElement | null = null;
  private addSheetBackdropEl: HTMLElement | null = null;

  private chromes = new Map<string, TabbedChrome>();
  /** instanceId of the currently visible tab */
  private activeId: string | null = null;

  private _onSpawnRequest: (viewId: ViewId) => void;
  private _onOpenSettings: (() => void) | undefined;

  constructor(onSpawnRequest: (viewId: ViewId) => void) {
    this._onSpawnRequest = onSpawnRequest;
  }

  public setSettingsCallback(fn: () => void): void {
    this._onOpenSettings = fn;
  }

  mount(area: HTMLElement): void {
    this.area = area;
    area.innerHTML = '';
    area.classList.add('tabbed-layout-active');

    // Main structure
    this.layoutEl = document.createElement('div');
    this.layoutEl.className = 'tabbed-layout';

    // Top bar: hamburger (opens add sheet) + app title + settings
    const topBarEl = document.createElement('div');
    topBarEl.className = 'tabbed-top-bar';

    const hamburgerBtn = document.createElement('button');
    hamburgerBtn.className = 'tabbed-top-bar-btn';
    hamburgerBtn.title = 'Open panel';
    hamburgerBtn.innerHTML = '<span class="material-icons">menu</span>';
    hamburgerBtn.addEventListener('click', () => this._openAddSheet());

    const titleEl = document.createElement('span');
    titleEl.className = 'tabbed-top-bar-title';
    titleEl.textContent = 'PracTempo';

    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'tabbed-top-bar-btn';
    settingsBtn.title = 'Settings';
    settingsBtn.innerHTML = '<span class="material-icons">settings</span>';
    settingsBtn.addEventListener('click', () => this._onOpenSettings?.());

    topBarEl.appendChild(hamburgerBtn);
    topBarEl.appendChild(titleEl);
    topBarEl.appendChild(settingsBtn);

    this.contentAreaEl = document.createElement('div');
    this.contentAreaEl.className = 'tabbed-content-area';

    this.tabBarEl = document.createElement('div');
    this.tabBarEl.className = 'tabbed-tab-bar';

    const addBtn = document.createElement('button');
    addBtn.className = 'tabbed-add-btn';
    addBtn.innerHTML = '<span class="material-icons">add</span>';
    addBtn.title = 'Add panel';
    addBtn.addEventListener('click', () => this._openAddSheet());
    this.tabBarEl.appendChild(addBtn);

    this.layoutEl.appendChild(topBarEl);
    this.layoutEl.appendChild(this.contentAreaEl);
    this.layoutEl.appendChild(this.tabBarEl);
    area.appendChild(this.layoutEl);

    // Add sheet (hidden by default)
    this._buildAddSheet();
  }

  unmount(): void {
    this.layoutEl?.remove();
    this.addSheetEl?.remove();
    this.addSheetBackdropEl?.remove();
    this.area?.classList.remove('tabbed-layout-active');
    this.layoutEl = null;
    this.contentAreaEl = null;
    this.tabBarEl = null;
    this.addSheetEl = null;
    this.addSheetBackdropEl = null;
    this.area = null;
  }

  createChrome(info: PanelSpawnInfo): PanelChrome {
    if (!this.contentAreaEl || !this.tabBarEl) {
      throw new Error('TabbedLayout.createChrome called before mount');
    }

    // Panel container
    const panelEl = document.createElement('div');
    panelEl.className = 'tabbed-panel';
    panelEl.dataset.instanceId = info.instanceId;
    panelEl.style.display = 'none';

    // Adopt the content element
    info.contentEl.classList.add('tabbed-panel-content');
    panelEl.appendChild(info.contentEl);
    this.contentAreaEl.appendChild(panelEl);

    // Tab entry (inserted before the add button)
    const tabEl = document.createElement('div');
    tabEl.className = 'tabbed-tab';
    tabEl.dataset.instanceId = info.instanceId;

    const icon = this._getIcon(info.instanceId, info);
    const iconEl = document.createElement('span');
    iconEl.className = 'material-icons tabbed-tab-icon';
    iconEl.textContent = icon;

    const titleEl = document.createElement('span');
    titleEl.className = 'tabbed-tab-title';
    titleEl.textContent = info.title;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tabbed-tab-close';
    closeBtn.innerHTML = '<span class="material-icons">close</span>';
    closeBtn.title = 'Close';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      info.onClose?.(info.instanceId);
    });

    tabEl.appendChild(iconEl);
    tabEl.appendChild(titleEl);
    tabEl.appendChild(closeBtn);
    tabEl.addEventListener('click', () => this.focus(info.instanceId));

    // Insert before the add button
    const addBtn = this.tabBarEl.querySelector('.tabbed-add-btn');
    this.tabBarEl.insertBefore(tabEl, addBtn ?? null);

    const chrome = new TabbedChrome(info.contentEl, panelEl, tabEl, titleEl);
    this.chromes.set(info.instanceId, chrome);

    // Auto-focus the first (or only) panel
    if (!this.activeId) this.focus(info.instanceId);

    return chrome;
  }

  focus(instanceId: string): void {
    if (!this.contentAreaEl || !this.tabBarEl) return;

    // Hide all panels, deactivate all tabs
    this.contentAreaEl.querySelectorAll<HTMLElement>('.tabbed-panel').forEach(p => {
      p.style.display = 'none';
    });
    this.tabBarEl.querySelectorAll('.tabbed-tab').forEach(t => t.classList.remove('is-active'));

    // Show this panel, activate its tab
    const panelEl = this.contentAreaEl.querySelector<HTMLElement>(`[data-instance-id="${instanceId}"]`);
    const tabEl = this.tabBarEl.querySelector<HTMLElement>(`[data-instance-id="${instanceId}"]`);
    if (panelEl) panelEl.style.display = '';
    if (tabEl) tabEl.classList.add('is-active');
    this.activeId = instanceId;
  }

  serializeLayout(): LayoutData {
    const order = Array.from(this.chromes.keys());
    return {
      tabbed: {
        order,
        activeId: this.activeId ?? undefined,
      },
    };
  }

  applyLayoutData(data: LayoutData | undefined): void {
    if (!data?.tabbed) return;
    const { order, activeId } = data.tabbed;
    // Re-order tabs by saved order (best-effort)
    if (order && this.tabBarEl) {
      const addBtn = this.tabBarEl.querySelector('.tabbed-add-btn');
      for (const id of order) {
        const tabEl = this.tabBarEl.querySelector<HTMLElement>(`[data-instance-id="${id}"]`);
        if (tabEl) this.tabBarEl.insertBefore(tabEl, addBtn ?? null);
      }
    }
    // Restore active tab
    const focusId = activeId ?? this.activeId ?? order?.[0];
    if (focusId && this.chromes.has(focusId)) this.focus(focusId);
  }

  // ─── Add sheet ─────────────────────────────────────────────────────────────

  private _buildAddSheet(): void {
    // Backdrop
    this.addSheetBackdropEl = document.createElement('div');
    this.addSheetBackdropEl.className = 'tabbed-add-backdrop';
    this.addSheetBackdropEl.style.display = 'none';
    this.addSheetBackdropEl.addEventListener('click', () => this._closeAddSheet());
    document.body.appendChild(this.addSheetBackdropEl);

    // Sheet
    this.addSheetEl = document.createElement('div');
    this.addSheetEl.className = 'tabbed-add-sheet';
    this.addSheetEl.style.display = 'none';

    const header = document.createElement('div');
    header.className = 'tabbed-add-header';
    const headerTitle = document.createElement('span');
    headerTitle.textContent = 'Add Panel';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'tabbed-add-close';
    closeBtn.innerHTML = '<span class="material-icons">close</span>';
    closeBtn.addEventListener('click', () => this._closeAddSheet());
    header.appendChild(headerTitle);
    header.appendChild(closeBtn);
    this.addSheetEl.appendChild(header);

    const groups = getNavSectionGroups();
    for (const group of groups) {
      const visibleEntries = group.entries.filter(e => {
        const desc = getFloatingViewDescriptor(e.viewId);
        return desc?.showInMenu !== false;
      });
      if (!visibleEntries.length) continue;

      const sectionEl = document.createElement('div');
      sectionEl.className = 'tabbed-add-section';

      const sectionTitle = document.createElement('h3');
      sectionTitle.className = 'tabbed-add-section-title';
      sectionTitle.textContent = group.label;
      sectionEl.appendChild(sectionTitle);

      for (const entry of visibleEntries) {
        const desc = getFloatingViewDescriptor(entry.viewId);
        const btn = document.createElement('button');
        btn.className = 'tabbed-add-item';

        const iconEl = document.createElement('span');
        iconEl.className = 'material-icons tabbed-add-item-icon';
        iconEl.textContent = desc?.icon ?? 'widgets';

        const labelEl = document.createElement('span');
        labelEl.textContent = entry.label;

        btn.appendChild(iconEl);
        btn.appendChild(labelEl);
        btn.addEventListener('click', () => {
          this._closeAddSheet();
          this._onSpawnRequest(entry.viewId);
        });
        sectionEl.appendChild(btn);
      }

      this.addSheetEl.appendChild(sectionEl);
    }

    document.body.appendChild(this.addSheetEl);
  }

  private _openAddSheet(): void {
    if (!this.addSheetEl || !this.addSheetBackdropEl) return;
    this.addSheetEl.style.display = '';
    this.addSheetBackdropEl.style.display = '';
  }

  private _closeAddSheet(): void {
    if (!this.addSheetEl || !this.addSheetBackdropEl) return;
    this.addSheetEl.style.display = 'none';
    this.addSheetBackdropEl.style.display = 'none';
  }

  private _getIcon(instanceId: string, info: PanelSpawnInfo): string {
    if (info.icon) return info.icon;
    const desc = getFloatingViewDescriptor(instanceId as ViewId);
    return desc?.icon ?? 'widgets';
  }
}
