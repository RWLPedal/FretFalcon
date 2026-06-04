import { GroupRowData } from "./types";

export const GROUP_COLOR_PALETTE: readonly string[] = [
  '--note-root',
  '--note-second',
  '--note-third',
  '--note-fourth',
  '--note-fifth',
  '--note-sixth',
  '--note-seventh',
];

export function buildGroupSidebarRow(data: GroupRowData): HTMLElement {
  const groupDiv = document.createElement('div');
  groupDiv.classList.add('sidebar-group-row', 'schedule-row');
  groupDiv.dataset.rowType = 'group';

  const color = data.color ?? GROUP_COLOR_PALETTE[0];
  groupDiv.dataset.color = color;
  groupDiv.dataset.collapsed = 'false';
  groupDiv.style.setProperty('--group-color', `var(${color})`);

  // Collapse toggle
  const collapseBtn = document.createElement('button');
  collapseBtn.type = 'button';
  collapseBtn.classList.add('group-collapse-btn');
  collapseBtn.setAttribute('aria-label', 'Collapse group');
  collapseBtn.textContent = '▾';
  collapseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isCollapsed = groupDiv.dataset.collapsed === 'true';
    groupDiv.dataset.collapsed = isCollapsed ? 'false' : 'true';
    collapseBtn.textContent = isCollapsed ? '▾' : '▸';
    applyGroupCollapse(groupDiv);
  });
  groupDiv.appendChild(collapseBtn);

  // Color swatch button
  const swatchBtn = document.createElement('button');
  swatchBtn.type = 'button';
  swatchBtn.classList.add('group-color-swatch-btn');
  swatchBtn.title = 'Change group color';
  _updateSwatchColor(swatchBtn, color);
  swatchBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    _openColorPopover(swatchBtn, groupDiv);
  });
  groupDiv.appendChild(swatchBtn);

  // Name (contenteditable span)
  const nameSpan = document.createElement('span');
  nameSpan.classList.add('group-name');
  nameSpan.contentEditable = 'true';
  nameSpan.spellcheck = false;
  nameSpan.textContent = data.name || 'New Group';
  nameSpan.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); nameSpan.blur(); }
    e.stopPropagation(); // Don't trigger keyboard shortcuts while editing
  });
  nameSpan.addEventListener('blur', () => {
    if (!nameSpan.textContent?.trim()) nameSpan.textContent = 'New Group';
  });
  groupDiv.appendChild(nameSpan);

  // Stats badge — right-aligned before the + button
  const statsBadge = document.createElement('span');
  statsBadge.classList.add('group-stats-badge');
  statsBadge.textContent = '';
  groupDiv.appendChild(statsBadge);

  // + add interval button
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.classList.add('group-add-btn');
  addBtn.textContent = '+';
  addBtn.title = 'Add interval to this group';
  addBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    groupDiv.dispatchEvent(new CustomEvent('group-add-interval', {
      bubbles: true,
      detail: { groupEl: groupDiv },
    }));
  });
  groupDiv.appendChild(addBtn);

  // Delete button
  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.classList.add('row-delete-btn');
  deleteBtn.textContent = '×';
  deleteBtn.title = 'Remove group';
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    groupDiv.remove();
  });
  groupDiv.appendChild(deleteBtn);

  return groupDiv;
}

/**
 * Walks all schedule rows in the container and stamps each interval row with
 * the --group-color of its preceding group, so the colored left border matches.
 */
export function propagateGroupColors(container: HTMLElement): void {
  let currentColor = '';
  for (const el of container.querySelectorAll<HTMLElement>('.schedule-row')) {
    if (el.dataset.rowType === 'group') {
      currentColor = el.dataset.color ?? '';
    } else if (el.dataset.rowType === 'interval') {
      if (currentColor) {
        el.style.setProperty('--group-color', `var(${currentColor})`);
      } else {
        el.style.removeProperty('--group-color');
      }
    }
  }
}

/** Recalculates and updates the count · duration badge for a group row. */
export function refreshGroupStats(groupEl: HTMLElement): void {
  const statsBadge = groupEl.querySelector<HTMLElement>('.group-stats-badge');
  if (!statsBadge) return;

  let count = 0;
  let totalSeconds = 0;
  let el = groupEl.nextElementSibling as HTMLElement | null;
  while (el && el.dataset.rowType !== 'group') {
    if (el.classList.contains('schedule-row')) {
      count++;
      totalSeconds += _parseDurationToSeconds(el.dataset.duration ?? '0:00');
    }
    el = el.nextElementSibling as HTMLElement | null;
  }

  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  statsBadge.textContent = `${count} · ${mins}:${String(secs).padStart(2, '0')}`;
}

/** Shows or hides the child interval rows of a group based on its collapsed state. */
export function applyGroupCollapse(groupEl: HTMLElement): void {
  const collapsed = groupEl.dataset.collapsed === 'true';
  let el = groupEl.nextElementSibling as HTMLElement | null;
  while (el && el.dataset.rowType !== 'group') {
    el.style.display = collapsed ? 'none' : '';
    el = el.nextElementSibling as HTMLElement | null;
  }
}

function _updateSwatchColor(btn: HTMLButtonElement, colorVar: string): void {
  btn.style.backgroundColor = `var(${colorVar})`;
}

function _openColorPopover(anchor: HTMLButtonElement, groupEl: HTMLElement): void {
  document.querySelector('.group-color-popover')?.remove();

  const popover = document.createElement('div');
  popover.classList.add('group-color-popover');

  GROUP_COLOR_PALETTE.forEach((cssVar) => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.classList.add('color-swatch-item');
    if (groupEl.dataset.color === cssVar) swatch.classList.add('is-selected');
    swatch.style.backgroundColor = `var(${cssVar})`;
    swatch.title = cssVar.replace('--note-', '');
    swatch.addEventListener('click', (e) => {
      e.stopPropagation();
      groupEl.dataset.color = cssVar;
      groupEl.style.setProperty('--group-color', `var(${cssVar})`);
      _updateSwatchColor(anchor, cssVar);
      popover.remove();
      document.removeEventListener('click', closeHandler, true);
      // Re-propagate color to child intervals
      const container = groupEl.parentElement;
      if (container) propagateGroupColors(container);
    });
    popover.appendChild(swatch);
  });

  document.body.appendChild(popover);

  const rect = anchor.getBoundingClientRect();
  popover.style.position = 'fixed';
  popover.style.top = `${rect.bottom + 4}px`;
  popover.style.left = `${rect.left}px`;
  popover.style.zIndex = '9999';

  // Close when clicking outside
  const closeHandler = (e: MouseEvent) => {
    if (!popover.contains(e.target as Node)) {
      popover.remove();
      document.removeEventListener('click', closeHandler, true);
    }
  };
  setTimeout(() => document.addEventListener('click', closeHandler, true), 0);
}

function _parseDurationToSeconds(duration: string): number {
  const parts = duration.split(':');
  if (parts.length === 2) {
    return (parseInt(parts[0] ?? '0', 10) * 60) + parseInt(parts[1] ?? '0', 10);
  }
  return parseInt(duration, 10) || 0;
}
