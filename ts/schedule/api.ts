/**
 * Public API surface for the schedule subsystem.
 * This is the ONLY file outside ts/schedule/ may import.
 *
 * Privileged callers: modules/schedule_panel, screen_config/default_configs
 */
export { BEGINNER_WORKOUT_SCHEDULE_JSON } from './presets/beginner_workout';
export { ADVANCED_WORKOUT_SCHEDULE_JSON } from './presets/advanced_workout';

import { View } from '../core/view';
import { AppSettings } from '../settings';
import { ScheduleFloatingView } from './schedule_floating_view';

/** Factory used by modules/schedule_panel to create the schedule editor view. */
export function createScheduleEditorView(
  initialState: unknown,
  appSettings: AppSettings,
): View {
  return new ScheduleFloatingView(initialState, appSettings);
}
