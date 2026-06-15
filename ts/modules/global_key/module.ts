// Privileged: uses drive.broadcast = true (Global Key broadcast mechanism).
// LinkManager reads the broadcast viewId from drive_registry instead of
// a constructor-injected string — CORE_VIEW_IDS.GlobalKey can now be removed.

import { ViewModule, ViewContext, viewId } from "../module_types";
import { NavSection } from "../../core/ids";
import { GlobalKeyView } from "./global_key_view";
import {
  SignalKind,
  KeySignal,
  ChordSignal,
  DiatonicMode,
  KeyType,
} from "../../panels/link_types";
import { scales } from "../../music/scales";
import { ChordQuality } from "../../music/music_types";

const GLOBAL_KEY_ID = viewId("global_key");

function tonicIsMinor(scaleKey: string): boolean {
  const scale = (scales as any)[scaleKey];
  if (!scale || typeof scale.getChordQualityAt !== "function") return false;
  const q = scale.getChordQualityAt(0);
  return q === ChordQuality.Minor || q === ChordQuality.Diminished;
}

const module: ViewModule = {
  id: GLOBAL_KEY_ID,
  panel: {
    displayName: "Global Key",
    icon: "cell_tower",
    size: { default: { cols: 19, rows: 5 }, min: { cols: 15, rows: 5 }, max: { cols: 29, rows: 9 } },
    singleton: true,
  },
  nav: {
    section: NavSection.Utilities,
    label: "Global Key",
  },
  drive: {
    broadcast: true,
    sources: [
      {
        viewId: GLOBAL_KEY_ID,
        emittedKinds: [SignalKind.Key, SignalKind.Chord],
        extractSignals(detail: any) {
          const rootNote: string = detail?.root ?? "C";
          const scaleKey: DiatonicMode = detail?.mode ?? DiatonicMode.Ionian;
          const keySignal: KeySignal = {
            kind: SignalKind.Key,
            rootNote,
            scaleKey,
          };
          const chordSignal: ChordSignal = {
            kind: SignalKind.Chord,
            chordKey: null,
            rootNote,
            keyType: tonicIsMinor(scaleKey) ? KeyType.Minor : KeyType.Major,
            roman: null,
          };
          return [keySignal, chordSignal];
        },
      },
    ],
  },
  createView(_ctx: ViewContext, state?: unknown) {
    return new GlobalKeyView(state);
  },
};

export default module;
