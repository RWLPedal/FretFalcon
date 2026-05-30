// ts/fretboard/features/chord_degree_base.ts
// Shared base for features driven by an ordered chord-degree list (OrderedDegreeList UI).
import {
  ArgType,
  ConfigurationSchemaArg,
  LabelValue,
  UiComponentType,
} from '../../feature';
import { InstrumentFeature } from '../fretboard_base';
import { AppSettings } from '../../settings';
import { AudioController } from '../../audio_controller';
import { InstrumentIntervalSettings } from '../fretboard_interval_settings';
import { ALL_DIATONIC_MODES, DIATONIC_MODE_LABELS } from '../music_types';
import { NOTE_NAMES_FROM_A } from '../fretboard_utils';
import { scales } from '../scales';
import { SignalKind, SignalState, ChordSignal } from '../../panels/link_types';

/** Builds a basic 7-degree label set per diatonic mode (no advanced/7th entries). */
export function buildChordDegreeLabelsByMode(): Record<string, { basic: LabelValue[]; advanced: LabelValue[] }> {
  const result: Record<string, { basic: LabelValue[]; advanced: LabelValue[] }> = {};
  for (const mode of ALL_DIATONIC_MODES) {
    const entries = scales[mode].generateRomanEntries(true);
    const basic = entries.slice(0, 7).map((e, i) => ({ label: e.roman, value: String(i) }));
    result[mode] = { basic, advanced: [] };
  }
  return result;
}

export const CHORD_DEGREE_LABELS_BY_MODE = buildChordDegreeLabelsByMode();

export function rootNoteArg(availableRoots?: string[]): ConfigurationSchemaArg {
  return {
    name: 'Root Note',
    type: ArgType.Enum,
    required: true,
    enum: availableRoots ?? (NOTE_NAMES_FROM_A as string[]),
    description: 'Root note of the progression.',
  };
}

export function modeArg(controlsArgName = 'Degrees'): ConfigurationSchemaArg {
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

export function degreesArg(labelsByMode = CHORD_DEGREE_LABELS_BY_MODE): ConfigurationSchemaArg {
  return {
    name: 'Degrees',
    type: ArgType.String,
    required: false,
    uiComponentType: UiComponentType.OrderedDegreeList,
    uiComponentData: { labelsByMode },
    isVariadic: true,
    description: 'Ordered chord degrees for the progression — duplicates allowed.',
  };
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
    intervalSettings: InstrumentIntervalSettings,
    audioController?: AudioController,
    maxCanvasHeight?: number
  ) {
    super(config, settings, intervalSettings, audioController, maxCanvasHeight);
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
