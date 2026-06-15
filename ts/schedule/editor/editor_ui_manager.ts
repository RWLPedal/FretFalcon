import { parseScheduleJSON } from "./schedule_serializer";

export class EditorUIManager {
  public containerEl: HTMLElement;

  // Visual mode elements
  public editorBodyEl!: HTMLElement;
  public sidebarListEl!: HTMLElement;
  public sidebarFooterEl!: HTMLElement;
  public inspectorEl!: HTMLElement;
  public addGroupBtnEl!: HTMLButtonElement;
  public addIntervalBtnEl!: HTMLButtonElement;
  public setScheduleButtonEl!: HTMLButtonElement;
  public saveScheduleBtnEl!: HTMLButtonElement;
  public loadScheduleBtnEl!: HTMLButtonElement;

  // Code mode elements
  public codeModeEl!: HTMLElement;
  public textEl!: HTMLTextAreaElement;
  public codeStatusEl!: HTMLElement;
  public applyChangesBtn!: HTMLButtonElement;
  public switchToVisualBtn!: HTMLButtonElement;

  // Header elements
  public scheduleNameDisplayEl!: HTMLElement;
  public scheduleStatsEl!: HTMLElement;
  public transitionInputEl!: HTMLInputElement;
  public modeToggleEl!: HTMLButtonElement;

  // For ErrorDisplay compatibility (referenced in schedule_editor.ts)
  public editorControlsContainerEl!: HTMLElement;
  public configEntriesContainerEl: HTMLElement;

  private _debounceTimer: number | null = null;

  constructor(containerEl: HTMLElement) {
    if (!containerEl) throw new Error('EditorUIManager: Container element is required.');
    this.containerEl = containerEl;
    this._renderBaseHTML();
    this.configEntriesContainerEl = this.sidebarListEl;
    this.editorControlsContainerEl = this.sidebarFooterEl;
  }

  private _renderBaseHTML(): void {
    this.containerEl.innerHTML = '';
    this.containerEl.classList.add('editor-root');

    // ── Header ────────────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.classList.add('editor-header');

    // Left: name + stats
    const headerLeft = document.createElement('div');
    headerLeft.classList.add('editor-header-left');

    this.scheduleNameDisplayEl = document.createElement('span');
    this.scheduleNameDisplayEl.id = 'schedule-name-display';
    this.scheduleNameDisplayEl.classList.add('schedule-name-display');
    this.scheduleNameDisplayEl.title = 'Double-click to rename';
    this.scheduleNameDisplayEl.contentEditable = 'false';
    this.scheduleNameDisplayEl.addEventListener('dblclick', () => {
      this.scheduleNameDisplayEl.contentEditable = 'true';
      this.scheduleNameDisplayEl.classList.add('is-editing');
      this.scheduleNameDisplayEl.focus();
      const range = document.createRange();
      range.selectNodeContents(this.scheduleNameDisplayEl);
      const sel = window.getSelection();
      if (sel) { sel.removeAllRanges(); sel.addRange(range); }
    });
    this.scheduleNameDisplayEl.addEventListener('blur', () => {
      this.scheduleNameDisplayEl.contentEditable = 'false';
      this.scheduleNameDisplayEl.classList.remove('is-editing');
    });
    this.scheduleNameDisplayEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.scheduleNameDisplayEl.blur(); }
    });
    headerLeft.appendChild(this.scheduleNameDisplayEl);

    this.scheduleStatsEl = document.createElement('span');
    this.scheduleStatsEl.classList.add('schedule-stats');
    headerLeft.appendChild(this.scheduleStatsEl);

    // Schedule-wide "get ready" transition between intervals.
    const transitionWrap = document.createElement('label');
    transitionWrap.classList.add('schedule-transition-control');
    transitionWrap.title =
      'Seconds of "get ready" countdown inserted before each interval (0 = none)';
    const transitionLabel = document.createElement('span');
    transitionLabel.classList.add('schedule-transition-label');
    transitionLabel.textContent = 'Transition';
    this.transitionInputEl = document.createElement('input');
    this.transitionInputEl.type = 'number';
    this.transitionInputEl.min = '0';
    this.transitionInputEl.max = '60';
    this.transitionInputEl.step = '1';
    this.transitionInputEl.classList.add('schedule-transition-input');
    const transitionUnit = document.createElement('span');
    transitionUnit.classList.add('schedule-transition-unit');
    transitionUnit.textContent = 's';
    transitionWrap.appendChild(transitionLabel);
    transitionWrap.appendChild(this.transitionInputEl);
    transitionWrap.appendChild(transitionUnit);
    headerLeft.appendChild(transitionWrap);

    header.appendChild(headerLeft);

    const headerActions = document.createElement('div');
    headerActions.classList.add('editor-header-actions');

    this.loadScheduleBtnEl = this._createBtn('Load', 'Load a saved schedule from file', ['btn-outline']);
    this.saveScheduleBtnEl = this._createBtn('Save', 'Save schedule to file', ['btn-outline']);
    this.modeToggleEl = this._createBtn('</> Code', 'Switch to code editor', ['btn-outline']);

    headerActions.appendChild(this.loadScheduleBtnEl);
    headerActions.appendChild(this.saveScheduleBtnEl);
    headerActions.appendChild(this.modeToggleEl);

    header.appendChild(headerActions);
    this.containerEl.appendChild(header);

    // ── Visual editor body (sidebar | resize handle | inspector) ──────────────
    this.editorBodyEl = document.createElement('div');
    this.editorBodyEl.classList.add('editor-body');

    // Restore persisted sidebar width
    const savedWidth = _loadSidebarWidth();
    this.editorBodyEl.style.setProperty('--sidebar-width', `${savedWidth}px`);

    const sidebar = document.createElement('div');
    sidebar.classList.add('editor-sidebar');

    this.sidebarListEl = document.createElement('div');
    this.sidebarListEl.id = 'config-entries-container';
    this.sidebarListEl.classList.add('editor-sidebar-list');
    this.sidebarListEl.setAttribute('tabindex', '-1');
    sidebar.appendChild(this.sidebarListEl);

    // Sidebar footer: reserved for ErrorDisplay insertion point
    this.sidebarFooterEl = document.createElement('div');
    this.sidebarFooterEl.classList.add('editor-sidebar-footer');
    sidebar.appendChild(this.sidebarFooterEl);
    this.editorBodyEl.appendChild(sidebar);

    // Resize handle
    const resizeHandle = document.createElement('div');
    resizeHandle.classList.add('editor-resize-handle');
    resizeHandle.setAttribute('aria-hidden', 'true');
    this.editorBodyEl.appendChild(resizeHandle);
    _attachResizeDrag(resizeHandle, this.editorBodyEl);

    this.inspectorEl = document.createElement('div');
    this.inspectorEl.classList.add('editor-inspector');
    this.editorBodyEl.appendChild(this.inspectorEl);

    this.containerEl.appendChild(this.editorBodyEl);

    // ── Code mode ──────────────────────────────────────────────────────────────
    this.codeModeEl = document.createElement('div');
    this.codeModeEl.classList.add('editor-code-mode');
    this.codeModeEl.style.display = 'none';

    const codeHeader = document.createElement('div');
    codeHeader.classList.add('code-mode-header');
    const codeTitle = document.createElement('span');
    codeTitle.classList.add('code-mode-title');
    codeTitle.textContent = '</> CODE';
    const codeSubtitle = document.createElement('span');
    codeSubtitle.classList.add('code-mode-subtitle');
    codeSubtitle.textContent = 'Advanced — edit the schedule as raw JSON';
    this.switchToVisualBtn = this._createBtn('‹ Visual editor', 'Switch back to visual editor', ['btn-outline', 'btn-sm']);
    codeHeader.appendChild(codeTitle);
    codeHeader.appendChild(codeSubtitle);
    codeHeader.appendChild(this.switchToVisualBtn);
    this.codeModeEl.appendChild(codeHeader);

    this.textEl = document.createElement('textarea');
    this.textEl.id = 'schedule-text-editor';
    this.textEl.classList.add('editor-textarea');
    this.textEl.placeholder = 'Schedule JSON';
    this.textEl.spellcheck = false;
    this.codeModeEl.appendChild(this.textEl);

    const codeFooter = document.createElement('div');
    codeFooter.classList.add('code-mode-footer');
    this.codeStatusEl = document.createElement('span');
    this.codeStatusEl.classList.add('code-status');
    this.codeStatusEl.textContent = '';
    this.applyChangesBtn = this._createBtn('Apply changes', '', ['btn-primary']);
    codeFooter.appendChild(this.codeStatusEl);
    codeFooter.appendChild(this.applyChangesBtn);
    this.codeModeEl.appendChild(codeFooter);

    this.containerEl.appendChild(this.codeModeEl);

    // ── Footer (+ Group, + Interval, Apply) ───────────────────────────────────
    const footer = document.createElement('div');
    footer.classList.add('editor-footer');

    this.addGroupBtnEl = this._createBtn('+ Group', 'Add a new group', ['btn-ghost']);
    this.addIntervalBtnEl = this._createBtn('+ Interval', 'Add an interval to the last group', ['btn-ghost']);
    this.setScheduleButtonEl = this._createBtn(
      '▶ Apply',
      'Build and start this schedule',
      ['btn-primary', 'btn-apply']
    );

    footer.appendChild(this.addGroupBtnEl);
    footer.appendChild(this.addIntervalBtnEl);
    footer.appendChild(this.setScheduleButtonEl);
    this.containerEl.appendChild(footer);

    // Wire live JSON parse status
    this.textEl.addEventListener('input', () => this._onTextInput());
  }

  private _onTextInput(): void {
    if (this._debounceTimer !== null) clearTimeout(this._debounceTimer);
    this._debounceTimer = window.setTimeout(() => {
      try {
        const doc = parseScheduleJSON(this.textEl.value);
        const count = doc.items.filter(i => i.rowType === 'interval').length;
        this.codeStatusEl.textContent = `Parsed live · ${count} interval${count !== 1 ? 's' : ''}`;
        this.codeStatusEl.classList.remove('code-status-error');
      } catch {
        this.codeStatusEl.textContent = 'Parse error';
        this.codeStatusEl.classList.add('code-status-error');
      }
    }, 400);
  }

  public setModeUI(isTextMode: boolean): void {
    this.editorBodyEl.style.display = isTextMode ? 'none' : '';
    this.codeModeEl.style.display = isTextMode ? '' : 'none';
    this.modeToggleEl.textContent = isTextMode ? '≡ Visual' : '</> Code';
    this.modeToggleEl.title = isTextMode ? 'Switch to visual editor' : 'Switch to code editor';
  }

  public setApplyButtonLabel(label: string): void {
    this.setScheduleButtonEl.textContent = `▶ ${label}`;
  }

  /** Recomputes and displays total duration, interval count, and group count. */
  public updateScheduleStats(): void {
    const rows = this.sidebarListEl.querySelectorAll<HTMLElement>('.schedule-row');
    let intervalCount = 0;
    let groupCount = 0;
    let totalSeconds = 0;

    rows.forEach(row => {
      if (row.dataset.rowType === 'interval') {
        intervalCount++;
        totalSeconds += _parseDurationSeconds(row.dataset.duration ?? '');
      } else if (row.dataset.rowType === 'group') {
        groupCount++;
      }
    });

    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const durStr = `${mins}:${String(secs).padStart(2, '0')}`;
    const iLabel = intervalCount === 1 ? 'interval' : 'intervals';
    const gLabel = groupCount === 1 ? 'group' : 'groups';
    this.scheduleStatsEl.textContent =
      intervalCount === 0 ? '' : `${durStr} · ${intervalCount} ${iLabel} · ${groupCount} ${gLabel}`;
  }

  public updateCopyPasteButtonState(_canCopy: boolean, _canPaste: boolean): void {
    // Copy/paste via keyboard shortcuts only in new design
  }

  public populateConfigUI(
    buildRowCallback: (rowData: any) => HTMLElement | null,
    rowDataArray: any[]
  ): void {
    this.sidebarListEl.innerHTML = '';
    rowDataArray.forEach((rowData) => {
      const el = buildRowCallback(rowData);
      if (el) this.sidebarListEl.appendChild(el);
    });
  }

  private _createBtn(text: string, title: string, classes: string[] = []): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = text;
    if (title) btn.title = title;
    btn.classList.add('editor-btn', ...classes);
    return btn;
  }
}

// ─── Module helpers ───────────────────────────────────────────────────────────

function _parseDurationSeconds(duration: string): number {
  const parts = duration.split(':');
  if (parts.length === 2) return parseInt(parts[0] ?? '0', 10) * 60 + parseInt(parts[1] ?? '0', 10);
  return parseInt(duration, 10) || 0;
}

// ─── Resize drag helpers ──────────────────────────────────────────────────────

const SIDEBAR_WIDTH_KEY = 'editor-sidebar-width';
const SIDEBAR_MIN = 150;
const SIDEBAR_MAX = 520;
const SIDEBAR_DEFAULT = 280;

function _loadSidebarWidth(): number {
  const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY);
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return isNaN(parsed) ? SIDEBAR_DEFAULT : Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, parsed));
}

function _saveSidebarWidth(px: number): void {
  localStorage.setItem(SIDEBAR_WIDTH_KEY, String(px));
}

function _attachResizeDrag(handle: HTMLElement, body: HTMLElement): void {
  handle.addEventListener('mousedown', (startEvent: MouseEvent) => {
    startEvent.preventDefault();

    const startX = startEvent.clientX;
    const startWidth = _loadSidebarWidth();

    const onMove = (e: MouseEvent) => {
      const delta = e.clientX - startX;
      const newWidth = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startWidth + delta));
      body.style.setProperty('--sidebar-width', `${newWidth}px`);
    };

    const onUp = (e: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.classList.remove('is-resizing-editor');
      const delta = e.clientX - startX;
      const finalWidth = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startWidth + delta));
      _saveSidebarWidth(finalWidth);
    };

    document.body.classList.add('is-resizing-editor');
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}
