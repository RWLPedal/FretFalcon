# Adding a New View

Adding a view to PracTempo is intentionally a two-file job: one module file and, if
you need a unique view component, one view class file.  The build picks up new modules
automatically — no registration boilerplate required.

---

## 1. Create `ts/modules/<name>/module.ts`

Default-export a `ViewModule` object.  For views that display a fretboard feature
(scales, chords, etc.) use the `featurePanelModule()` helper:

```ts
// ts/modules/my_feature/module.ts
import { featurePanelModule, viewId } from '../module_types';
import { NavSection } from '../../core/ids';
import { MyFeature } from '../../fretboard/features/my_feature';
import { SignalKind } from '../../panels/link_types';

export default featurePanelModule({
  id: viewId('instrument_my_feature'),    // unique, snake_case string
  displayName: 'My Feature',
  icon: 'star',                           // Material Icons name
  featureTypeName: MyFeature.typeName,
  defaultSize: { width: 420, height: 550 },
  nav: {
    section: NavSection.Fretboard,        // which sidebar section
    label: 'My Feature',
    // requiredInstruments: ['Guitar'],   // optional — omit to show for all
  },
  drive: {
    targets: [
      {
        featureTypeName: MyFeature.typeName,
        argName: 'Root Note',             // must match the feature's config key
        label: 'Root note (from linked source)',
        acceptedKinds: [SignalKind.Chord, SignalKind.Key],
        resolveValue(signal) {
          if (signal.kind !== SignalKind.Chord && signal.kind !== SignalKind.Key) return null;
          return signal.rootNote || null;
        },
      },
    ],
  },
});
```

For standalone views (not fretboard features), build the `ViewModule` object directly
and co-locate the view class inside the same module folder:

```ts
// ts/modules/my_view/module.ts
import { ViewModule, ViewContext, viewId } from '../module_types';
import { NavSection } from '../../core/ids';
import { MyView } from './my_view';             // co-located in ts/modules/my_view/

const module: ViewModule = {
  id: viewId('my_view'),
  panel: {
    displayName: 'My View',
    icon: 'star',
    defaultSize: { width: 400, height: 300 },
  },
  nav: { section: NavSection.PracticeTools, label: 'My View' },
  createView(ctx: ViewContext, state?: unknown) {
    return new MyView(state, ctx.appSettings);
  },
};

export default module;
```

---

## 2. Implement the view (if needed)

If you're wrapping an existing `ConfigurableFeatureView`-based feature, step 1 is
all you need.  For a new standalone view, create `ts/modules/my_view/my_view.ts`
(co-located with `module.ts`) and implement the `View` interface:

```ts
export interface View {
  render(container: HTMLElement): void;
  start?(): void;
  stop?(): void;
  destroy?(): void;
}
```

---

## 3. Build

```
node build.js
```

The manifest (`ts/modules/manifest.ts`) uses webpack's `require.context` to
auto-discover every `*/module.ts` file under `ts/modules/`.  Your new module is
registered automatically.

---

## ViewModule reference

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Unique `ViewId`, e.g. `viewId('instrument_my_feature')` |
| `panel.displayName` | yes | Human-readable name shown in title bar |
| `panel.icon` | yes | Material Icons name |
| `panel.defaultSize` | no | `{ width, height }` in pixels |
| `panel.minSize` | no | Minimum `{ width, height }` in pixels |
| `panel.showInMenu` | no | Show in spawnable-view picker (default `true`) |
| `panel.singleton` | no | Prevent opening more than one instance |
| `panel.refreshOnInstrumentChange` | no | Recreate on instrument/settings change |
| `panel.capabilities.rotate` | no | Show rotate button in title bar |
| `panel.capabilities.zoom` | no | Show zoom button in title bar |
| `panel.capabilities.configToggle` | no | Show config toggle (⚙) button |
| `panel.featureTypeName` | no | Feature type name (for feature panels) |
| `nav` | no | Adds a button to the sidebar/mobile nav |
| `nav.section` | yes (if nav) | One of: `fretboard`, `practice_tools`, `sound`, `schedule`, `utilities`, `extensions` |
| `nav.label` | yes (if nav) | Button text |
| `nav.visibility` | no | `desktop`, `mobile`, or `both` (default `both`) |
| `nav.requiredInstruments` | no | Instrument names that show the button |
| `drive.sources` | no | Drive source descriptors — signals this view can emit |
| `drive.targets` | no | Drive target slots — config args that can be driven |
| `drive.broadcast` | no | `true` to broadcast signals to all panels (Global Key pattern) |
| `state.decode` | no | Decodes persisted state for type-safe `createView` |
| `createView` | yes | Factory: `(ctx: ViewContext, state?) => View` |

---

## Allowed imports in module files

Module files may import from:

- `../module_types` — `ViewModule`, `ViewContext`, `viewId`, `featurePanelModule`, `Visibility`
- `../../core/ids` — `NavSection`, `CORE_VIEW_IDS`
- `../../panels/link_types` — signal types (`DriveSignal`, `SignalKind`, etc.)
- `../../panels/drive_registry` — `DriveSourceDescriptor`, `DriveTargetSlot`
- `../../fretboard/**` — feature classes, music types, scales
- `'./my_view'` — your co-located view class inside `ts/modules/<name>/` (standalone views only)
- `../../core/base_view` — `BaseView` base class for views
- `../../core/widgets/**` — shared UI widgets: `ValueSlider`, `VolumeControl`, `ThemeSwatchPicker`

Do **not** import from `panel_manager`, `link_manager`, `panel_registry`, `reference_page/*`,
or `mobile/*` — these are internal implementation details.

---

## NavSectionId values

| Constant | Value | Sidebar label |
|----------|-------|---------------|
| `NavSection.Fretboard` | `'fretboard'` | Reference |
| `NavSection.PracticeTools` | `'practice_tools'` | Practice Tools |
| `NavSection.Sound` | `'sound'` | Sound |
| `NavSection.Schedule` | `'schedule'` | Schedule |
| `NavSection.Utilities` | `'utilities'` | Utilities |
| `NavSection.Extensions` | `'extensions'` | Extensions |
