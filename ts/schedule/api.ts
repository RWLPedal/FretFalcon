/**
 * Public API surface for the schedule subsystem.
 * This is the ONLY file outside ts/schedule/ may import.
 *
 * Privileged callers: modules/schedule_panel, screen_config/default_configs
 */
export { A_MINOR_WORKOUT_SCHEDULE_JSON } from './presets/a_minor_workout';

import { View } from '../view';
import { AppSettings } from '../settings';
import { ScheduleFloatingView } from './schedule_floating_view';

/** Factory used by modules/schedule_panel to create the schedule editor view. */
export function createScheduleEditorView(
  initialState: unknown,
  appSettings: AppSettings,
): View {
  return new ScheduleFloatingView(initialState, appSettings);
}
