// ts/fretboard/features/chord_degree_base.ts
import {
  ArgType,
  ConfigurationSchemaArg,
  UiComponentType,
} from '../../feature';
import { InstrumentFeature } from '../fretboard_base';
import { AppSettings } from '../../settings';
import { ALL_DIATONIC_MODES, DIATONIC_MODE_LABELS } from '../../music/music_types';
import { NOTE_NAMES_FROM_A } from '../fretboard_utils';
import { SignalKind, SignalState, ChordSignal } from '../../panels/link_types';

export function rootNoteArg(availableRoots?: string[]): ConfigurationSchemaArg {
  return {
    name: 'Root Note',
    type: ArgType.Enum,
    required: true,
    enum: availableRoots ?? (NOTE_NAMES_FROM_A as string[]),
    description: 'Root note of the progression.',
  };
}

export function modeArg(controlsArgName = 'Chords'): ConfigurationSchemaArg {
  return {
    name: 'Mode',
    type: ArgType.Enum,
    required: true,
    enum: ALL_DIATONIC_MODES as string[],
    enumLabels: ALL_DIATONIC_MODES.map(m => DIATONIC_MODE_LABELS[m]),
    description: 'Diatonic mode.',
    controlsArgName,
  };
}

/**
 * Config arg for an ordered chord sequence rendered as a popup chord-entry widget.
 *
 * When `diatonicOnly` is true (default for ChordProgressionFeature):
 *   - Only in-key chords are offered; values stored as degree indices ("0"–"6")
 *   - The progression transposes automatically when root or mode changes
 *
 * When `diatonicOnly` is false (NearbyTriadsFeature):
 *   - Any chord can be entered; values stored as absolute chord keys ("C_MAJ")
 */
export function chordEntryArg(diatonicOnly = false): ConfigurationSchemaArg {
  return {
    name: 'Chords',
    type: ArgType.String,
    required: false,
    uiComponentType: UiComponentType.ChordEntryWidget,
    uiComponentData: { diatonicOnly },
    isVariadic: true,
    description: diatonicOnly
      ? 'Ordered chord degrees — stored relative to key, transposes automatically.'
      : 'Ordered chord sequence — enter by name or Roman numeral. Repeats allowed.',
  };
}

/**
 * Builds the "{prefix} in {root} {mode}" header shared by chord-degree features.
 * When the prefix (Roman numerals / chord names) is empty — e.g. a freshly opened,
 * not-yet-configured panel — falls back to "{fallbackLabel} — {root} {mode}" so the
 * title isn't a leading-space fragment and stays distinct per tool.
 */
export function composeDegreeHeader(
  prefix: string,
  rootNote: string,
  modeLabel: string,
  fallbackLabel: string,
): string {
  const where = `${rootNote} ${modeLabel}`;
  return prefix.trim() ? `${prefix} in ${where}` : `${fallbackLabel} — ${where}`;
}

/**
 * Abstract base for chord-degree features that respond to drive signals.
 * Manages the active-chord signal listener and `activeChordKey` state.
 */
export abstract class ChordDegreeProgressionFeature extends InstrumentFeature {
  protected activeChordKey: string | null = null;
  private _chordSignalHandler: ((e: Event) => void) | null = null;
  private _chordSignalContainer: HTMLElement | null = null;

  constructor(
    config: ReadonlyArray<string>,
    settings: AppSettings,
    maxCanvasHeight?: number,
    maxWidth?: number,
  ) {
    super(config, settings, maxCanvasHeight, maxWidth);
  }

  /**
   * Attaches a listener for chord drive-signals that updates `activeChordKey`
   * and calls `onChanged`. Any previous listener is detached first.
   *
   * @param guard  When provided and returning true, the signal is ignored.
   *               Use this to suppress highlights when a driven-mode is active.
   */
  protected attachChordSignalListener(
    container: HTMLElement,
    onChanged: () => void,
    guard?: () => boolean
  ): void {
    this.detachChordSignalListener();
    this._chordSignalHandler = (e: Event) => {
      const signal = (e as CustomEvent).detail?.signal;
      if (!signal) return;
      if (guard?.()) return;
      if (signal.kind !== SignalKind.Chord) return;
      const cs = signal as ChordSignal;
      if (cs.state !== SignalState.Next) {
        this.activeChordKey = cs.chordKey;
        onChanged();
      }
    };
    this._chordSignalContainer = container;
    container.addEventListener('drive-signal', this._chordSignalHandler);
  }

  protected detachChordSignalListener(): void {
    if (this._chordSignalContainer && this._chordSignalHandler) {
      this._chordSignalContainer.removeEventListener('drive-signal', this._chordSignalHandler);
    }
    this._chordSignalHandler = null;
    this._chordSignalContainer = null;
  }

  destroy?(): void {
    this.detachChordSignalListener();
    super.destroy?.();
  }
}

