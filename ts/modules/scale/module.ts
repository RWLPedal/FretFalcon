import { featurePanelModule, viewId } from "../module_types";
import { NavSection } from "../../core/ids";
import { CORE_VIEW_IDS } from "../../core/ids";
import { ScaleFeature } from "../../fretboard/features/scale_feature";
import {
  SignalKind,
  DiatonicMode,
  KeyType,
  DriveSignal,
} from "../../panels/link_types";
import { scales } from "../../music/scales";
import { ChordQuality } from "../../music/music_types";

const SCALE_ID = viewId("instrument_scale");

const SCALE_NAME_TO_MODE: Record<string, DiatonicMode> = {
  Major: DiatonicMode.Ionian,
  Dorian: DiatonicMode.Dorian,
  Phrygian: DiatonicMode.Phrygian,
  Lydian: DiatonicMode.Lydian,
  Mixolydian: DiatonicMode.Mixolydian,
  Minor: DiatonicMode.Aeolian,
  "Natural Minor": DiatonicMode.Aeolian,
  Locrian: DiatonicMode.Locrian,
};

function scaleNameForKey(scaleKey: string): string {
  return (scales as any)[scaleKey]?.name ?? "Major";
}

function tonicIsMinor(scaleKey: string): boolean {
  const scale = (scales as any)[scaleKey];
  if (!scale || typeof scale.getChordQualityAt !== "function") return false;
  const q = scale.getChordQualityAt(0);
  return q === ChordQuality.Minor || q === ChordQuality.Diminished;
}

function extractScaleSignals(detail: any): DriveSignal[] {
  const config: string[] = detail?.config ?? [];
  const rootNote: string = config[1] ?? "C";
  const scaleName: string = config[0] ?? "Major";
  const scaleKey: DiatonicMode =
    SCALE_NAME_TO_MODE[scaleName] ?? DiatonicMode.Ionian;
  const keyType: KeyType = tonicIsMinor(scaleKey)
    ? KeyType.Minor
    : KeyType.Major;
  return [
    { kind: SignalKind.Chord, chordKey: null, rootNote, keyType, roman: null },
    { kind: SignalKind.Key, rootNote, scaleKey },
  ];
}

export default featurePanelModule({
  id: SCALE_ID,
  displayName: "Scale",
  icon: "show_chart",
  featureTypeName: ScaleFeature.typeName,
  defaultSize: { width: 550, height: 420 },
  // Rotated (horizontal) the fretboard is wide and short. Sizes are set explicitly
  // rather than swapping w/h, since the header/config row keeps its height when
  // rotated (see rotateSize in panels/panel_sizing for the swap-fallback helper).
  orientationSizes: {
    horizontal: { defaultSize: { width: 820, height: 300 } },
  },
  nav: {
    section: NavSection.Fretboard,
    label: "Scales",
  },
  drive: {
    sources: [
      {
        viewId: SCALE_ID,
        featureTypeName: ScaleFeature.typeName,
        emittedKinds: [SignalKind.Chord, SignalKind.Key],
        extractSignals: extractScaleSignals,
      },
      {
        viewId: CORE_VIEW_IDS.ConfigurableFeature,
        featureTypeName: ScaleFeature.typeName,
        emittedKinds: [SignalKind.Chord, SignalKind.Key],
        extractSignals: extractScaleSignals,
      },
    ],
    targets: [
      {
        featureTypeName: ScaleFeature.typeName,
        argName: "ScaleName",
        label: "Scale name (from linked source)",
        acceptedKinds: [SignalKind.Key, SignalKind.Chord],
        resolveValue(signal) {
          if (signal.kind === SignalKind.Key)
            return scaleNameForKey(signal.scaleKey);
          if (signal.kind === SignalKind.Chord) {
            return signal.keyType === KeyType.Major ? "Major" : "Natural Minor";
          }
          return null;
        },
      },
      {
        featureTypeName: ScaleFeature.typeName,
        argName: "Root Note",
        label: "Root note (from linked source)",
        acceptedKinds: [SignalKind.Key, SignalKind.Chord],
        resolveValue(signal) {
          if (
            signal.kind !== SignalKind.Chord &&
            signal.kind !== SignalKind.Key
          )
            return null;
          return signal.rootNote;
        },
      },
    ],
  },
});
