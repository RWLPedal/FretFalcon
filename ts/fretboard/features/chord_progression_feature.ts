// ts/fretboard/features/chord_progression_feature.ts
import {
  Feature,
  ConfigurationSchema,
} from '../../feature';
import { InstrumentFeature, peekPendingCanvasWidth } from '../fretboard_base';
import { ChordDegreeProgressionFeature, rootNoteArg, modeArg, chordEntryArg } from './chord_degree_base';
import { BaseView } from '../../core/base_view';
import { Chord, getChordLibraryForInstrument, getAvailableRoots } from '../chords';
import { AppSettings } from '../../settings';
import { InstrumentSettings, DEFAULT_INSTRUMENT_SETTINGS } from '../fretboard_settings';
import {
  NOTE_NAMES_FROM_A,
  getKeyIndex,
  addHeader,
  clearAllChildren,
} from '../fretboard_utils';
import { InstrumentName } from '../fretboard';
import { DiatonicMode, DIATONIC_MODE_LABELS } from '../music_types';
import { getChordInKey } from '../progressions';
import { ChordDiagramView } from '../views/chord_diagram_view';
import { getEasiestMoveableShape, MOVEABLE_CHORD_LIBRARIES } from '../moveable_shapes';
import { planChordDiagramGrid } from '../fretboard_layout';
import { getRomansForMode, resolveAbsoluteChordKey } from '../chord_key_resolver';

interface ChordProgSlot {
  /** chord_tones_library key for drive-signal comparison; null when unresolvable. */
  signalKey: string | null;
  view: ChordDiagramView | null;
  unresolvable: UnresolvableChordView | null;
}

/** Displays chord diagrams for an ordered Roman numeral progression in a given key and mode. */
export class ChordProgressionFeature extends ChordDegreeProgressionFeature {
  static readonly typeName = 'Chord Progression';
  static readonly displayName = 'Chord Progression';
  static readonly requiredInstruments = [
    InstrumentName.Guitar, InstrumentName.Ukulele, InstrumentName.Mandolin, InstrumentName.Mandola,
    InstrumentName.TenorGuitar, InstrumentName.TenorBanjo, InstrumentName.Charango,
  ] as const;
  static readonly description =
    'Displays chord diagrams for a Roman numeral progression (e.g., I–IV–V) in a specified key and mode.';

  readonly typeName = ChordProgressionFeature.typeName;

  private readonly headerText: string;
  private chordSlots: ChordProgSlot[] = [];

  constructor(
    config: ReadonlyArray<string>,
    progDegrees: number[],
    rootNote: string,
    mode: DiatonicMode,
    settings: AppSettings,
    maxCanvasHeight?: number
  ) {
    const totalWidth = peekPendingCanvasWidth();
    super(config, settings, maxCanvasHeight);

    const rootNoteIndex  = getKeyIndex(rootNote);
    const guitarSettings = (settings.instrumentSettings as InstrumentSettings | undefined) ?? DEFAULT_INSTRUMENT_SETTINGS;
    const chordLibrary   = getChordLibraryForInstrument(guitarSettings.instrument);
    const romans         = getRomansForMode(mode);
    const modeLabel      = DIATONIC_MODE_LABELS[mode] ?? mode;

    const romanLabels = progDegrees.map(d => romans[d - 1]?.roman ?? String(d));
    this.headerText = `${romanLabels.join(' – ')} in ${rootNote} ${modeLabel}`;

    if (progDegrees.length > 0) {
      const { config: fc } = planChordDiagramGrid(
        this.fretboardConfig, totalWidth, maxCanvasHeight,
        progDegrees.length, guitarSettings.zoomMultiplier ?? 1.2
      );
      this.fretboardConfig = fc;
    }

    if (rootNoteIndex === -1) {
      console.error(`[${this.typeName}] Invalid root note: ${rootNote}`);
      return;
    }

    for (const deg of progDegrees) {
      const entry    = romans[deg - 1];
      const numeral  = entry?.roman ?? String(deg);
      const signalKey = entry ? resolveAbsoluteChordKey(numeral, rootNote, mode) : null;

      const chordDetails = getChordInKey(rootNoteIndex, numeral, mode, chordLibrary);
      const chordData    = chordDetails.chordKey ? chordLibrary[chordDetails.chordKey] : null;

      if (chordData) {
        const title = `${chordDetails.chordName} (${numeral})`;
        this.chordSlots.push({ signalKey, view: new ChordDiagramView(chordData, title, this.fretboardConfig), unresolvable: null });
      } else {
        const easiest = getEasiestMoveableShape(
          guitarSettings.instrument, chordDetails.chordName, this.fretboardConfig.tuning
        );
        if (easiest) {
          const title = `${chordDetails.chordName} [${easiest.shapeName}] (${numeral})`;
          this.chordSlots.push({ signalKey, view: new ChordDiagramView(easiest, title, this.fretboardConfig), unresolvable: null });
        } else {
          console.warn(`[${this.typeName}] No shape for ${chordDetails.chordName} (${numeral}) in ${rootNote} ${mode}`);
          this.chordSlots.push({ signalKey, view: null, unresolvable: new UnresolvableChordView(chordDetails.chordName, numeral) });
        }
      }
    }
  }

  render(container: HTMLElement): void {
    this.detachChordSignalListener();
    clearAllChildren(container);
    const header = addHeader(container, this.headerText);
    header.classList.add('feature-main-title');

    if (this.chordSlots.length === 0) {
      const placeholder = document.createElement('div');
      placeholder.style.cssText = 'font-size:0.82rem;color:var(--clr-text-subtle,#888);text-align:center;padding:16px 0;';
      placeholder.textContent = 'No chords configured — add chords in the settings above.';
      container.appendChild(placeholder);
      return;
    }

    const grid = document.createElement('div');
    grid.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;';
    container.appendChild(grid);

    for (const slot of this.chordSlots) {
      if (slot.view)         slot.view.render(grid);
      else if (slot.unresolvable) slot.unresolvable.render(grid);
    }

    this.attachChordSignalListener(container, () => this.updateDiagramHighlights());
    this.updateDiagramHighlights();
  }

  private updateDiagramHighlights(): void {
    for (const slot of this.chordSlots) {
      if (slot.view) {
        slot.view.setActive(slot.signalKey !== null && slot.signalKey === this.activeChordKey);
      }
    }
  }

  destroy?(): void {
    for (const slot of this.chordSlots) {
      slot.view?.destroy();
    }
    this.chordSlots = [];
    super.destroy?.();
  }

  static getConfigurationSchema(settings?: AppSettings): ConfigurationSchema {
    const instrument = (settings?.instrumentSettings?.instrument as InstrumentName) ?? InstrumentName.Guitar;
    const hasMoveable = instrument in MOVEABLE_CHORD_LIBRARIES;
    const roots = hasMoveable
      ? undefined
      : getAvailableRoots(getChordLibraryForInstrument(instrument));
    return {
      description: `Config: ${this.typeName},RootNote,Mode[,Deg0,...]`,
      args: [rootNoteArg(roots), modeArg(), chordEntryArg(true)],
    };
  }

  static createFeature(
    config: ReadonlyArray<string>,
    settings: AppSettings,
    maxCanvasHeight: number | undefined,
    _categoryName: string
  ): Feature {
    if (config.length < 2) {
      throw new Error(`[${this.typeName}] Config must have at least [RootNote, Mode].`);
    }

    const rootNoteName = config[0];
    const modeStr      = config[1];

    const legacyMap: Record<string, DiatonicMode> = { Major: DiatonicMode.Ionian, Minor: DiatonicMode.Aeolian };
    const mode: DiatonicMode = (Object.values(DiatonicMode) as string[]).includes(modeStr)
      ? (modeStr as DiatonicMode)
      : (legacyMap[modeStr] ?? DiatonicMode.Ionian);

    const keyIndex = getKeyIndex(rootNoteName);
    if (keyIndex === -1) throw new Error(`[${this.typeName}] Unknown root note: "${rootNoteName}"`);
    const validRootName = NOTE_NAMES_FROM_A[keyIndex] ?? rootNoteName;

    // Degree strings are single digits "0"–"6" (0-based index into the mode's Roman entries).
    // Legacy Roman strings are silently skipped by the filter.
    const degreeStrings = config.slice(2).filter(s => /^\d$/.test(s));
    const progDegrees   = degreeStrings.map(s => parseInt(s, 10) + 1);

    return new ChordProgressionFeature(
      config,
      progDegrees,
      validRootName,
      mode,
      settings,
      maxCanvasHeight
    );
  }
}

/** Placeholder shown when no chord shape (library or moveable) could be found. */
class UnresolvableChordView extends BaseView {
  private chordName: string;
  private numeral: string;

  constructor(chordName: string, numeral: string) {
    super();
    this.chordName = chordName;
    this.numeral   = numeral;
  }

  render(container: HTMLElement): void {
    const wrapper = document.createElement('div');
    wrapper.classList.add('chord-diagram-view');
    wrapper.style.cssText = 'display:inline-block;vertical-align:top;padding:5px;text-align:center;opacity:0.6;';

    const titleEl = document.createElement('div');
    titleEl.classList.add('chord-diagram-title');
    titleEl.textContent = `${this.chordName} (${this.numeral})`;
    const warn = document.createElement('span');
    warn.textContent = ' ⚠';
    warn.title = 'No chord shape found for this chord';
    warn.style.cssText = 'color:var(--clr-warning, #e6a817);font-size:0.9em;';
    titleEl.appendChild(warn);
    wrapper.appendChild(titleEl);

    const msg = document.createElement('div');
    msg.style.cssText = 'font-size:0.75rem;color:var(--clr-text-subtle);margin-top:8px;';
    msg.textContent = 'No shape found';
    wrapper.appendChild(msg);

    container.appendChild(wrapper);
  }
}
