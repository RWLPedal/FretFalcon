// ts/views/capo_view.ts
import { BaseView } from '../base_view';
import { AppSettings } from '../settings';
import { getChordLibraryForInstrument, Chord, ChordType } from '../instrument/chords';
import { getKeyIndex, NOTE_NAMES_FROM_A } from '../instrument/instrument_utils';

/**
 * A compact view that displays open MAJOR and MINOR chord shapes for the current
 * instrument and shows what each chord "sounds like" with a capo applied.
 *
 * Layout (each row is a rounded pill):
 *   Shape  |  Sounds Like
 *   ──────────────────
 *   A             E
 *   Am            Em
 *   ...
 */
export class CapoView extends BaseView {
  private appSettings: AppSettings;
  private capoFret = 0;
  private chords: { name: string; rootSemitone: number }[] = [];
  private rowsContainer: HTMLElement | null = null;

  constructor(appSettings: AppSettings) {
    super();
    this.appSettings = appSettings;
  }

  /** Given a NoteName string (e.g. "A", "Bb", "F#"), returns its A-indexed semitone (0-11). */
  private static semitoneFromNote(noteStr: string): number {
    const idx = getKeyIndex(noteStr);
    return idx >= 0 ? idx : 0;
  }

  /** Returns the note name at `semitone` in A-indexed space, using sharp spellings. */
  private static noteNameFromSemitone(semitone: number): string {
    const idx = ((semitone % 12) + 12) % 12;
    return NOTE_NAMES_FROM_A[idx];
  }

  /** Extract the root note from a chord name like "Am", "C", "F#m", "Bb". */
  private static parseRoot(name: string): string {
    // The root is everything up to (but not including) the first lowercase letter or 'm', 'M', '7', etc.
    // Chord names are like "A", "Am", "C", "C#", "F#m", "Bb", "Bb m" etc.
    const match = name.match(/^([A-G][#b]?)/);
    return match ? match[1] : name;
  }

  /** Extract the suffix (everything after the root note), e.g. "m" from "Am". */
  private static parseSuffix(name: string): string {
    const root = CapoView.parseRoot(name);
    return name.slice(root.length);
  }

  render(container: HTMLElement): void {
    container.classList.add('capo-view');

    const instrument = this.appSettings?.instrumentSettings?.instrument ?? 'Guitar';
    const library = getChordLibraryForInstrument(instrument as any);

    // Collect open/unbarred MAJOR and MINOR chords
    this.chords = [];
    for (const chord of Object.values(library)) {
      if (chord.chordType !== ChordType.MAJOR && chord.chordType !== ChordType.MINOR) continue;
      if (chord.barre && chord.barre.length > 0) continue;
      const rootStr = CapoView.parseRoot(chord.name);
      const rootSemitone = CapoView.semitoneFromNote(rootStr);
      this.chords.push({ name: chord.name, rootSemitone });
    }

    // Sort: majors first (by root semitone), then minors
    this.chords.sort((a, b) => {
      const aIsMajor = !a.name.includes('m');
      const bIsMajor = !b.name.includes('m');
      if (aIsMajor !== bIsMajor) return aIsMajor ? -1 : 1;
      return a.rootSemitone - b.rootSemitone;
    });

    // --- Capo fret dropdown ---
    const capoRow = document.createElement('div');
    capoRow.classList.add('capo-view-capo-row');

    const capoLabel = document.createElement('label');
    capoLabel.classList.add('capo-view-label');
    capoLabel.textContent = 'Capo Fret';
    capoRow.appendChild(capoLabel);

    const capoSelect = document.createElement('select');
    capoSelect.classList.add('capo-view-select');
    for (let f = 0; f <= 12; f++) {
      const opt = document.createElement('option');
      opt.value = String(f);
      opt.textContent = f === 0 ? 'None' : `Fret ${f}`;
      if (f === this.capoFret) opt.selected = true;
      capoSelect.appendChild(opt);
    }
    capoSelect.addEventListener('change', () => {
      this.capoFret = parseInt(capoSelect.value, 10);
      this.updateRows();
    });
    capoRow.appendChild(capoSelect);
    container.appendChild(capoRow);

    // --- Table header ---
    const headerRow = document.createElement('div');
    headerRow.classList.add('capo-view-header-row');
    const shapeHeader = document.createElement('span');
    shapeHeader.textContent = 'Shape';
    const soundsHeader = document.createElement('span');
    soundsHeader.textContent = 'Sounds Like';
    headerRow.appendChild(shapeHeader);
    headerRow.appendChild(soundsHeader);
    container.appendChild(headerRow);

    // --- Rows container (rebuilt on capo change) ---
    this.rowsContainer = document.createElement('div');
    this.rowsContainer.classList.add('capo-view-rows');
    container.appendChild(this.rowsContainer);

    this.updateRows();
  }

  private updateRows(): void {
    if (!this.rowsContainer) return;
    this.rowsContainer.innerHTML = '';

    for (const chord of this.chords) {
      const row = document.createElement('div');
      row.classList.add('capo-view-row');

      const left = document.createElement('span');
      left.classList.add('capo-view-row-left');
      left.textContent = chord.name;

      const right = document.createElement('span');
      right.classList.add('capo-view-row-right');

      // Transpose: add capoFret semitones
      const transposedSemitone = (chord.rootSemitone + this.capoFret) % 12;
      const newRoot = CapoView.noteNameFromSemitone(transposedSemitone);
      const suffix = CapoView.parseSuffix(chord.name);
      right.textContent = newRoot + suffix;

      row.appendChild(left);
      row.appendChild(right);
      this.rowsContainer.appendChild(row);
    }
  }
}