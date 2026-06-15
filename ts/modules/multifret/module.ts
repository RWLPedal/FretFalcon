import { featurePanelModule, viewId } from "../module_types";
import { NavSection } from "../../core/ids";
import { CORE_VIEW_IDS } from "../../core/ids";
import { MultiLayerFretboardFeature } from "../../fretboard/features/multi_layer_fretboard_feature";
import { SignalKind, KeyType, ChordSignal } from "../../panels/link_types";

const MULTIFRET_ID = viewId("instrument_multifret");

function extractMultiFretSignals(detail: any): ChordSignal[] {
  const config: string[] = detail?.config ?? [];
  const signals: ChordSignal[] = [];
  for (const layerStr of config) {
    const parts = layerStr.split("|");
    if (parts[0] === "chord" && parts.length >= 3) {
      const chordKey = parts[1] || null;
      signals.push({
        kind: SignalKind.Chord,
        chordKey,
        rootNote: chordKey?.split("_")[0] ?? "",
        keyType:
          chordKey?.endsWith("MIN") || chordKey?.endsWith("MIN7")
            ? KeyType.Minor
            : KeyType.Major,
        roman: null,
      });
    }
  }
  return signals;
}

export default featurePanelModule({
  id: MULTIFRET_ID,
  displayName: "MultiFret",
  icon: "layers",
  featureTypeName: MultiLayerFretboardFeature.typeName,
  size: { min: { cols: 22, rows: 25 }, default: { cols: 25, rows: 55 } },
  sizeHorizontal: {
    min: { cols: 40, rows: 20 },
    default: { cols: 50, rows: 25 },
  },
  nav: {
    section: NavSection.Fretboard,
    label: "MultiFret",
  },
  drive: {
    sources: [
      {
        viewId: MULTIFRET_ID,
        featureTypeName: MultiLayerFretboardFeature.typeName,
        emittedKinds: [SignalKind.Chord],
        extractSignals: extractMultiFretSignals,
      },
      {
        viewId: CORE_VIEW_IDS.ConfigurableFeature,
        featureTypeName: MultiLayerFretboardFeature.typeName,
        emittedKinds: [SignalKind.Chord],
        extractSignals: extractMultiFretSignals,
      },
    ],
    targets: [
      {
        featureTypeName: MultiLayerFretboardFeature.typeName,
        argName: "Layers",
        label: "Driven layer (from linked source)",
        acceptedKinds: [SignalKind.Chord, SignalKind.Key],
        resolveValue(_signal) {
          return null;
        },
      },
    ],
  },
});
