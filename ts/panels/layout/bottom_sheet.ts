// ts/panels/layout/bottom_sheet.ts
// A modal sheet that slides up from the bottom of the screen: the tabbed (mobile)
// layout's menu, add-a-tool picker and link list all render through one instance.
// Content is passed in on every open(), so it is always built from current state.

export interface SheetItem {
  icon?: string;
  label: string;
  onSelect: () => void;
}

export interface SheetSection {
  title?: string;
  items: SheetItem[];
}

export class BottomSheet {
  private backdropEl: HTMLElement;
  private sheetEl: HTMLElement;
  private titleEl: HTMLElement;
  private bodyEl: HTMLElement;
  private closeBtn: HTMLButtonElement;
  private _returnFocusTo: HTMLElement | null = null;
  private _open = false;

  constructor() {
    this.backdropEl = document.createElement('div');
    this.backdropEl.className = 'tabbed-sheet-backdrop';
    this.backdropEl.hidden = true;
    this.backdropEl.addEventListener('click', () => this.close());

    this.sheetEl = document.createElement('div');
    this.sheetEl.className = 'tabbed-sheet';
    this.sheetEl.hidden = true;
    this.sheetEl.setAttribute('role', 'dialog');
    this.sheetEl.setAttribute('aria-modal', 'true');

    const header = document.createElement('div');
    header.className = 'tabbed-sheet-header';
    this.titleEl = document.createElement('h2');
    this.titleEl.className = 'tabbed-sheet-title';
    this.titleEl.id = 'tabbed-sheet-title';
    this.sheetEl.setAttribute('aria-labelledby', this.titleEl.id);

    this.closeBtn = document.createElement('button');
    this.closeBtn.type = 'button';
    this.closeBtn.className = 'tabbed-sheet-close';
    this.closeBtn.setAttribute('aria-label', 'Close');
    this.closeBtn.innerHTML = '<span class="material-icons">close</span>';
    this.closeBtn.addEventListener('click', () => this.close());

    header.appendChild(this.titleEl);
    header.appendChild(this.closeBtn);

    this.bodyEl = document.createElement('div');
    this.bodyEl.className = 'tabbed-sheet-body';

    this.sheetEl.appendChild(header);
    this.sheetEl.appendChild(this.bodyEl);

    document.body.appendChild(this.backdropEl);
    document.body.appendChild(this.sheetEl);
  }

  get isOpen(): boolean {
    return this._open;
  }

  open(title: string, sections: SheetSection[]): void {
    this.titleEl.textContent = title;
    this.bodyEl.innerHTML = '';

    for (const section of sections) {
      if (!section.items.length) continue;
      const sectionEl = document.createElement('div');
      sectionEl.className = 'tabbed-sheet-section';

      if (section.title) {
        const h = document.createElement('h3');
        h.className = 'tabbed-sheet-section-title';
        h.textContent = section.title;
        sectionEl.appendChild(h);
      }

      for (const item of section.items) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tabbed-sheet-item';

        const iconEl = document.createElement('span');
        iconEl.className = 'material-icons tabbed-sheet-item-icon';
        iconEl.setAttribute('aria-hidden', 'true');
        iconEl.textContent = item.icon ?? 'widgets';

        const labelEl = document.createElement('span');
        labelEl.textContent = item.label;

        btn.appendChild(iconEl);
        btn.appendChild(labelEl);
        btn.addEventListener('click', () => {
          this.close();
          item.onSelect();
        });
        sectionEl.appendChild(btn);
      }

      this.bodyEl.appendChild(sectionEl);
    }

    if (!this._open) {
      this._returnFocusTo = document.activeElement as HTMLElement | null;
      document.addEventListener('keydown', this._onKeyDown);
    }
    this._open = true;
    this.backdropEl.hidden = false;
    this.sheetEl.hidden = false;
    this.bodyEl.scrollTop = 0;
    this.closeBtn.focus();
  }

  close(): void {
    if (!this._open) return;
    this._open = false;
    this.backdropEl.hidden = true;
    this.sheetEl.hidden = true;
    document.removeEventListener('keydown', this._onKeyDown);
    this._returnFocusTo?.focus?.();
    this._returnFocusTo = null;
  }

  destroy(): void {
    this.close();
    this.backdropEl.remove();
    this.sheetEl.remove();
  }

  private _onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
      return;
    }
    if (e.key !== 'Tab') return;
    // Keep keyboard focus inside the sheet while it is open.
    const focusable = [...this.sheetEl.querySelectorAll<HTMLElement>('button')];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !this.sheetEl.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !this.sheetEl.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  };
}
