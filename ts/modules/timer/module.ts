import { ViewModule, ViewContext, viewId } from "../module_types";
import { NavSection } from "../../core/ids";
import { TimerView } from "./timer_view";
import { SignalKind } from "../../panels/link_types";
import {
  registerDriveSource,
  registerDriveTarget,
} from "../../panels/drive_registry";

const TIMER_ID = viewId("floating_timer");

const module: ViewModule = {
  id: TIMER_ID,
  panel: {
    displayName: "Timer",
    icon: "alarm",
    defaultSize: { width: 300, height: 110 },
    minSize: { width: 195, height: 105 },
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
    return new TimerView((state as any)?.duration ?? 300);
  },
};

export default module;
