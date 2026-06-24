import { ViewModule, ViewContext, viewId } from "../module_types";
import { NavSection } from "../../core/ids";
import { TimerView } from "./timer_view";
import { SignalKind } from "../../panels/link_types";

const TIMER_ID = viewId("floating_timer");

const module: ViewModule = {
  id: TIMER_ID,
  panel: {
    displayName: "Timer",
    icon: "alarm",
    // Short/wide main face (status lives in the title bar, so the body is just the
    // bar + controls); `max` is tall enough to fit the inline config when open.
    size: { default: { cols: 24, rows: 8 }, min: { cols: 20, rows: 7 }, max: { cols: 40, rows: 24 } },
  },
  nav: {
    section: NavSection.PracticeTools,
    label: "Timer",
  },
  drive: {
    sources: [
      {
        viewId: TIMER_ID,
        emittedKinds: [SignalKind.Play],
        extractSignals: () => [],
      },
    ],
    targets: [
      {
        featureTypeName: "Timer",
        viewId: TIMER_ID,
        argName: "Play",
        label: "Play/stop (from linked source)",
        acceptedKinds: [SignalKind.Play],
        resolveValue: () => null,
      },
    ],
  },
  createView(_ctx: ViewContext, state?: unknown): TimerView {
    // TimerView normalizes the blob (and accepts a legacy `{ duration }` shape).
    return new TimerView(state);
  },
};

export default module;
