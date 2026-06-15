import { featurePanelModule, viewId } from "../module_types";
import { NavSection } from "../../core/ids";
import { CagedFeature } from "../../fretboard/features/caged_feature";
import { SignalKind } from "../../panels/link_types";
import { ChordQuality } from "../../music/music_types";
import { scales } from "../../music/scales";

function tonicIsMinor(scaleKey: string): boolean {
  const scale = (scales as any)[scaleKey];
  if (!scale || typeof scale.getChordQualityAt !== "function") return false;
  const q: ChordQuality = scale.getChordQualityAt(0);
  return q === ChordQuality.Minor || q === ChordQuality.Diminished;
}

export default featurePanelModule({
  id: viewId("instrument_caged"),
  displayName: "CAGED",
  icon: "grid_view",
  featureTypeName: CagedFeature.typeName,
  size: { min: { cols: 20, rows: 25 }, default: { cols: 22, rows: 40 } },
  sizeHorizontal: {
    min: { cols: 32, rows: 18 },
    default: { cols: 46, rows: 24 },
  },
  nav: {
    section: NavSection.Fretboard,
    label: "CAGED",
    requiredInstruments: ["Guitar"],
  },
  drive: {
    targets: [
      {
        featureTypeName: CagedFeature.typeName,
        argName: "Root Note",
        label: "Root note (from linked source)",
        acceptedKinds: [SignalKind.Chord, SignalKind.Key],
        resolveValue(signal) {
          if (
            signal.kind !== SignalKind.Chord &&
            signal.kind !== SignalKind.Key
          )
            return null;
          return signal.rootNote || null;
        },
      },
      {
        featureTypeName: CagedFeature.typeName,
        argName: "Scale Type",
        label: "Scale type (from linked key source)",
        acceptedKinds: [SignalKind.Key],
        resolveValue(signal) {
          if (signal.kind !== SignalKind.Key) return null;
          return tonicIsMinor(signal.scaleKey) ? "Minor" : "Major";
        },
      },
    ],
  },
});
