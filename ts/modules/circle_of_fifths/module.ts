import { ViewModule, ViewContext, viewId } from "../module_types";
import { NavSection } from "../../core/ids";
import { CircleOfFifthsView } from "./circle_of_fifths_view";
import {
  SignalKind,
  KeySignal,
  ChordSignal,
  DiatonicMode,
  KeyType,
} from "../../panels/link_types";

const COF_ID = viewId("circle_of_fifths");

const module: ViewModule = {
  id: COF_ID,
  panel: {
    displayName: "Circle of Fifths",
    icon: "donut_large",
    size: {
      default: { cols: 22 },
      min: { cols: 18, rows: 27 },
      max: { cols: 35, rows: 45 },
    },
  },
  nav: {
    section: NavSection.Fretboard,
    label: "Circle of 5ths",
  },
  drive: {
    sources: [
      {
        viewId: COF_ID,
        emittedKinds: [SignalKind.Key, SignalKind.Chord],
        extractSignals(detail: any) {
          const keySignal: KeySignal = {
            kind: SignalKind.Key,
            rootNote: detail?.root ?? "C",
            scaleKey: detail?.mode ?? DiatonicMode.Ionian,
          };
          const chordSignal: ChordSignal = {
            kind: SignalKind.Chord,
            chordKey: detail?.chordKey ?? null,
            rootNote: detail?.chordRoot ?? detail?.root ?? "C",
            keyType: detail?.keyType ?? KeyType.Major,
            roman: detail?.roman ?? null,
          };
          return [keySignal, chordSignal];
        },
      },
    ],
    targets: [
      {
        featureTypeName: "CircleOfFifths",
        viewId: COF_ID,
        argName: "_key",
        label: "Key (from linked source)",
        acceptedKinds: [SignalKind.Key, SignalKind.Chord],
        resolveValue: () => null,
      },
    ],
  },
  createView(_ctx: ViewContext, state?: unknown) {
    return new CircleOfFifthsView(state);
  },
};

export default module;
