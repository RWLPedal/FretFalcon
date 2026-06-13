// ts/fretboard/features/chord_entry_widget.ts
// Reusable CustomFieldController<string[]> wrapping ChordEntryPanel.
// Used by ChordProgressionFeatureSpec and NearbyTriadsFeatureSpec.

import type { CustomFieldController, CustomRenderContext } from '../../core/config/spec';
import { ChordEntryPanel, ChordEntry, entryDisplayLabel } from './chord_entry_panel';
import { DiatonicMode } from '../music_types';

/**
 * Builds a custom field controller for chord sequence entry.
 *
 * @param diatonicOnly  true → values are degree index strings "0"–"6" (transposable);
 *                      false → values are absolute chord keys "C_MAJ" (free entry)
 */
export function buildChordEntryWidget(
  container: HTMLElement,
  ctx: CustomRenderContext,
  diatonicOnly: boolean,
): CustomFieldController<string[]> {
  let currentValues: string[] = [];

  const readonlyRow = document.createElement('div');
  readonlyRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;align-items:center;min-height:22px;';

  const editBtn = document.createElement('button');
  editBtn.className = 'config-toggle-btn';
  editBtn.style.cssText = 'font-size:0.75rem;padding:1px 7px;';
  editBtn.textContent = '✎ Edit';

  container.appendChild(readonlyRow);
  container.appendChild(editBtn);

  const getRootMode = (): { rootNote: string; mode: DiatonicMode } => {
    const fv = ctx.getFieldValues();
    return {
      rootNote: (fv.rootNote as string) ?? 'C',
      mode: (fv.mode as DiatonicMode) ?? DiatonicMode.Ionian,
    };
  };

  const refreshDisplay = (values: string[], appliedEntries?: ChordEntry[]): void => {
    readonlyRow.innerHTML = '';
    if (values.length === 0) {
      const empty = document.createElement('span');
      empty.style.cssText = 'font-size:0.78rem;color:var(--clr-text-subtle,#888);';
      empty.textContent = 'No chords selected';
      readonlyRow.appendChild(empty);
      return;
    }
    const { rootNote, mode } = getRootMode();
    values.forEach((val, i) => {
      const chip = document.createElement('span');
      chip.style.cssText =
        'display:inline-flex;align-items:center;' +
        'background:var(--clr-chip,rgba(90,153,90,0.15));' +
        'border:1px solid var(--clr-chip-border,rgba(90,153,90,0.4));' +
        'border-radius:4px;padding:1px 7px;font-size:0.78rem;font-weight:500;white-space:nowrap;';
      const label = appliedEntries?.[i]?.display
        ?? entryDisplayLabel(val, diatonicOnly, rootNote, mode);
      chip.textContent = label;
      readonlyRow.appendChild(chip);
    });
  };

  let activePopup: HTMLElement | null = null;
  let activePanel: ChordEntryPanel | null = null;
  let activeOutsideHandler: ((ev: MouseEvent) => void) | null = null;

  const closePopup = (): void => {
    if (activeOutsideHandler) {
      document.removeEventListener('mousedown', activeOutsideHandler, true);
      activeOutsideHandler = null;
    }
    activePanel?.destroy();
    activePanel = null;
    activePopup?.remove();
    activePopup = null;
  };

  const openPopup = (): void => {
    if (activePopup) return;
    const { rootNote, mode } = getRootMode();

    const initialEntries: ChordEntry[] = currentValues.map((val): ChordEntry => ({
      value: val,
      display: entryDisplayLabel(val, diatonicOnly, rootNote, mode),
      roman: null,
    }));

    const panel = new ChordEntryPanel(rootNote, mode, diatonicOnly);
    panel.setInitialEntries(initialEntries);

    const popup = document.createElement('div');
    popup.style.cssText =
      'position:fixed;z-index:9999;background:var(--clr-panel,var(--dm-panel,#fff));' +
      'border:1px solid var(--clr-border,#ccc);border-radius:8px;' +
      'box-shadow:0 4px 16px rgba(0,0,0,0.15);padding:10px 12px;min-width:260px;max-width:340px;';
    document.body.appendChild(popup);
    activePopup = popup;
    activePanel = panel;

    const rect = editBtn.getBoundingClientRect();
    popup.style.top  = `${rect.bottom + 6}px`;
    popup.style.left = `${Math.min(rect.left, window.innerWidth - 360)}px`;

    panel.renderInto(popup,
      (entries) => {
        currentValues = entries.map(e => e.value);
        refreshDisplay(currentValues, entries);
        ctx.onChange();
        closePopup();
      },
      closePopup,
    );

    const onOutside = (ev: MouseEvent): void => {
      if (!popup.contains(ev.target as Node) && ev.target !== editBtn) {
        closePopup();
      }
    };
    activeOutsideHandler = onOutside;
    setTimeout(() => document.addEventListener('mousedown', onOutside, true), 0);

    const observer = new MutationObserver(() => {
      if (!document.body.contains(editBtn)) { closePopup(); observer.disconnect(); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  };

  editBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (activePopup) closePopup(); else openPopup();
  });

  refreshDisplay([]);

  return {
    getValue: () => [...currentValues],
    setValue: (v: string[]) => {
      currentValues = [...v];
      refreshDisplay(currentValues);
    },
    destroy: () => {
      closePopup();
    },
  };
}
