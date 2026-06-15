import { ViewModule, ViewContext, viewId } from "../module_types";
import { NavSection } from "../../core/ids";
import { CapoView } from "./capo_view";
import { InstrumentName } from "../../fretboard/instruments";
import { SignalKind, DriveSignal } from "../../panels/link_types";

const CAPO_ID = viewId("capo_view");

const module: ViewModule = {
  id: CAPO_ID,
  panel: {
    displayName: "Capo",
    icon: "adjust",
    size: {
      min: { cols: 14, rows: 22 },
      default: { cols: 14, rows: 22 },
      max: { cols: 20, rows: 34 },
    },
  },
  nav: {
    section: NavSection.Fretboard,
    label: "Capo",
    requiredInstruments: [
      InstrumentName.Guitar,
      InstrumentName.Ukulele,
      InstrumentName.Mandolin,
      InstrumentName.Mandola,
      InstrumentName.TenorBanjo,
      InstrumentName.Charango,
    ],
  },
  drive: {
    sources: [
      {
        viewId: CAPO_ID,
        emittedKinds: [SignalKind.Capo],
        extractSignals(detail: unknown): DriveSignal[] {
          const fret = (detail as { fret?: number })?.fret ?? 0;
          return [{ kind: SignalKind.Capo, fret }];
        },
      },
    ],
  },
  createView(ctx: ViewContext) {
    return new CapoView(ctx.appSettings);
  },
};

export default module;
