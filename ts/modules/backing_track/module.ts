import { ViewModule, ViewContext, viewId } from "../module_types";
import { NavSection } from "../../core/ids";
import { BackingTrackView } from "./view";
import {
  SignalKind,
  ChordSignal,
  KeySignal,
  GrooveSignal,
  DriveSignal,
  SignalState,
} from "../../panels/link_types";
import { DiatonicMode, KeyType } from "../../panels/link_types";

const DRUM_MACHINE_ID = viewId("drum_machine");

function keyTypeFromChordKey(chordKey: string | null): KeyType {
  if (!chordKey) return KeyType.Major;
  const suffix = chordKey.split("_")[1] ?? "";
  return suffix === "MAJ" || suffix === "MAJ7" || suffix === "DOM7"
    ? KeyType.Major
    : KeyType.Minor;
}

const module: ViewModule = {
  id: DRUM_MACHINE_ID,
  panel: {
    displayName: "Backing Track",
    icon: "queue_music",
    size: { default: { cols: 38, rows: 20 }, min: { cols: 38, rows: 20 } },
  },
  nav: {
    section: NavSection.PracticeTools,
    label: "Backing Track",
  },
  drive: {
    sources: [
      {
        viewId: DRUM_MACHINE_ID,
        emittedKinds: [
          SignalKind.Chord,
          SignalKind.Key,
          SignalKind.Groove,
          SignalKind.Play,
        ],
        emitsNextSignals: true,
        extractSignals(detail: any): DriveSignal[] {
          const roman: string | null = detail?.currentRoman ?? null;
          const root: string = detail?.progRootNote ?? "C";
          const progMode: DiatonicMode =
            detail?.progMode ?? DiatonicMode.Ionian;
          const chordKey: string | null = detail?.chordKey ?? null;

          const chordRoot = chordKey ? (chordKey.split("_")[0] ?? root) : root;
          const chordKeyType = keyTypeFromChordKey(chordKey);

          const chordSignal: ChordSignal = {
            kind: SignalKind.Chord,
            state: SignalState.Current,
            chordKey,
            rootNote: chordRoot,
            keyType: chordKeyType,
            roman,
          };
          const keySignal: KeySignal = {
            kind: SignalKind.Key,
            rootNote: root,
            scaleKey: progMode,
          };
          const signals: DriveSignal[] = [chordSignal, keySignal];
          if (typeof detail?.bpm === "number") {
            const grooveSignal: GrooveSignal = {
              kind: SignalKind.Groove,
              bpm: detail.bpm,
              timeSig: detail?.timeSig ?? { beats: 4, division: 4 },
              swing: detail?.swing ?? 0,
              beat: typeof detail?.beat === "number" ? detail.beat : undefined,
            };
            signals.push(grooveSignal);
          }
          const nextChordKey: string | null = detail?.nextChordKey ?? null;
          const nextRootNote: string | null = detail?.nextRootNote ?? null;
          const nextRoman: string | null = detail?.nextRoman ?? null;
          if (nextChordKey !== null || nextRootNote !== null) {
            const nextChordSignal: ChordSignal = {
              kind: SignalKind.Chord,
              state: SignalState.Next,
              chordKey: nextChordKey,
              rootNote: nextRootNote ?? root,
              keyType: keyTypeFromChordKey(nextChordKey),
              roman: nextRoman,
            };
            signals.push(nextChordSignal);
          }
          return signals;
        },
      },
    ],
    targets: [
      {
        featureTypeName: "BackingTrack",
        viewId: DRUM_MACHINE_ID,
        argName: "BPM",
        label: "BPM (from linked groove source)",
        acceptedKinds: [SignalKind.Groove],
        resolveValue: () => null,
      },
      {
        featureTypeName: "BackingTrack",
        viewId: DRUM_MACHINE_ID,
        argName: "Play",
        label: "Play/stop (from linked source)",
        acceptedKinds: [SignalKind.Play],
        resolveValue: () => null,
      },
      {
        featureTypeName: "BackingTrack",
        viewId: DRUM_MACHINE_ID,
        argName: "Strum",
        label: "Strum rhythm (from linked source)",
        acceptedKinds: [SignalKind.Strum],
        resolveValue: () => null,
      },
    ],
  },
  createView(_ctx: ViewContext, state?: unknown) {
    return new BackingTrackView(state);
  },
};

export default module;
