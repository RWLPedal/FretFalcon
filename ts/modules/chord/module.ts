import { featurePanelModule, viewId } from "../module_types";
import { NavSection } from "../../core/ids";
import { ChordFeature } from "../../fretboard/features/chord_feature";
import { SignalKind, KeyType } from "../../panels/link_types";

export default featurePanelModule({
  id: viewId("instrument_chord"),
  displayName: "Chord",
  icon: "grid_on",
  featureTypeName: ChordFeature.typeName,
  size: { min: { cols: 2, rows: 34 }, default: { cols: 29, rows: 34 } },
  nav: {
    section: NavSection.Fretboard,
    label: "Chords",
    requiredInstruments: [
      "Guitar",
      "Ukulele",
      "Charango",
      "Mandolin",
      "Mandola",
    ],
  },
  drive: {
    targets: [
      {
        featureTypeName: ChordFeature.typeName,
        argName: "Root",
        label: "Root note (from linked source)",
        acceptedKinds: [SignalKind.Chord],
        resolveValue(signal) {
          if (signal.kind !== SignalKind.Chord) return null;
          return signal.rootNote || null;
        },
      },
      {
        featureTypeName: ChordFeature.typeName,
        argName: "Type",
        label: "Chord type (from linked source)",
        acceptedKinds: [SignalKind.Chord],
        resolveValue(signal) {
          if (signal.kind !== SignalKind.Chord) return null;
          if (signal.chordKey) {
            const sep = signal.chordKey.indexOf("_");
            if (sep !== -1) {
              const suffix = signal.chordKey.slice(sep + 1);
              const suffixMap: Record<string, string> = {
                MAJ: "Major",
                MIN: "Minor",
                DIM: "Dim",
                DOM7: "7",
                MAJ7: "Maj7",
                MIN7: "Min7",
              };
              const resolved = suffixMap[suffix];
              if (resolved) return resolved;
            }
          }
          return signal.keyType === KeyType.Major ? "Major" : "Minor";
        },
      },
      {
        featureTypeName: ChordFeature.typeName,
        argName: "Capo",
        label: "Capo (from linked source)",
        acceptedKinds: [SignalKind.Capo],
        resolveValue: () => null,
      },
    ],
  },
});
