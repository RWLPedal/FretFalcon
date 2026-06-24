import { ViewModule, ViewContext, viewId } from "../module_types";
import { NavSection } from "../../core/ids";
import { ChordToolView } from "./chord_tool_view";
import { ChordFeature } from "../../fretboard/features/chord_feature";
import { SignalKind, KeyType } from "../../panels/link_types";

const module: ViewModule = {
  id: viewId("instrument_chord"),
  panel: {
    displayName: "Chord",
    icon: "grid_on",
    size: { min: { cols: 14, rows: 16 }, default: { cols: 32, rows: 28 } },
    refreshOnInstrumentChange: true,
    capabilities: { rotate: false, zoom: false, configToggle: false },
  },
  nav: {
    section: NavSection.Fretboard,
    label: "Chords",
    requiredInstruments: ["Guitar", "Ukulele", "Charango", "Mandolin", "Mandola"],
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
                MAJ: "Major", MIN: "Minor", DIM: "Dim",
                DOM7: "Dom 7", MAJ7: "Major 7", MIN7: "Minor 7",
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
  createView(ctx: ViewContext, state?: unknown) {
    return new ChordToolView(state, ctx.appSettings);
  },
};

export default module;
