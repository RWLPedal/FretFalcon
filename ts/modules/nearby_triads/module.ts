import { featurePanelModule, viewId } from "../module_types";
import { NavSection } from "../../core/ids";
import { NearbyTriadsFeature } from "../../fretboard/features/nearby_triads_feature";
import { SignalKind } from "../../panels/link_types";

export default featurePanelModule({
  id: viewId("instrument_nearby_triads"),
  displayName: "Nearby Triads",
  icon: "swap_horiz",
  featureTypeName: NearbyTriadsFeature.typeName,
  size: { min: { cols: 34, rows: 26 }, default: { cols: 46, rows: 32 } },
  sizeHorizontal: { default: { cols: 52, rows: 24 } },
  nav: {
    section: NavSection.Fretboard,
    label: "Nearby Triads",
    requiredInstruments: ["Guitar", "7-String Guitar", "8-String Guitar"],
  },
  drive: {
    targets: [
      {
        featureTypeName: NearbyTriadsFeature.typeName,
        argName: "Root Note",
        label: "Root note (from linked source)",
        acceptedKinds: [SignalKind.Key],
        resolveValue(signal) {
          if (signal.kind !== SignalKind.Key) return null;
          return signal.rootNote || null;
        },
      },
      {
        featureTypeName: NearbyTriadsFeature.typeName,
        argName: "Mode",
        label: "Mode (from linked source)",
        acceptedKinds: [SignalKind.Key],
        resolveValue(signal) {
          if (signal.kind !== SignalKind.Key) return null;
          return signal.scaleKey;
        },
      },
    ],
  },
});
