# Adding a New View

Adding a view to FretFalcon is intentionally a two-file job: one module file and, if
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
    // drive.targets declares which inputs are visible in the link panel UI.
    // Signal resolution is handled by FeatureSpec.configSpec[field].drivable — see step 2.
    targets: [
      {
        featureTypeName: MyFeature.typeName,
        argName: 'rootNote',
        label: 'Root note (from linked source)',
        acceptedKinds: [SignalKind.Chord, SignalKind.Key],
        resolveValue: () => null,  // resolution lives in FeatureSpec.configSpec
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

## 2. Implement a fretboard feature with FeatureSpec

For fretboard features, implement both the `Feature` class and a `FeatureSpec<C>` in
the same file.  `FeatureSpec` replaces the old `ConfigurationSchema`/`ArgType`
approach — it gives you typed config, a generated config UI, and drive-signal wiring
all in one declaration.

### 2a. Define a typed config interface and `ConfigSpec<C>`

```ts
// ts/fretboard/features/my_feature.ts
import { FeatureSpec, FeatureContext } from '../../feature';
import { featureTypeId, ConfigSpec } from '../../core/config/spec';
import { enumCodec } from '../../core/config/codecs';
import { SignalKind } from '../../panels/link_types';

export interface MyFeatureConfig {
  rootNote: string;
  scale: string;
}

const myFeatureConfigSpec: ConfigSpec<MyFeatureConfig> = {
  rootNote: {
    label: 'Root note',
    ui: { kind: 'select', options: ROOT_NOTE_OPTIONS },
    codec: enumCodec(ROOT_NOTE_OPTIONS.map(o => o.value)),
    default: 'C',
    drivable: {
      kinds: [SignalKind.Chord, SignalKind.Key],
      fromSignal(signal) {
        if (signal.kind === SignalKind.Chord || signal.kind === SignalKind.Key) {
          return signal.rootNote;
        }
      },
    },
  },
  scale: {
    label: 'Scale',
    ui: { kind: 'select', options: SCALE_OPTIONS },
    codec: enumCodec(SCALE_OPTIONS.map(o => o.value)),
    default: 'major',
  },
};
```

### 2b. Implement the `Feature` class

```ts
export class MyFeature implements Feature {
  static readonly typeName = 'MyFeature';
  readonly typeName = MyFeature.typeName;
  readonly config: ReadonlyArray<string> = [];
  views?: View[];

  constructor(
    private readonly rootNote: string,
    private readonly scale: string,
    private readonly settings: AppSettings,
    private readonly maxCanvasHeight?: number,
    private readonly maxWidth?: number,
  ) {}

  render(container: HTMLElement): void { /* ... */ }
}
```

### 2c. Declare the `FeatureSpec<C>`

```ts
export const MyFeatureSpec: FeatureSpec<MyFeatureConfig> = {
  featureTypeId: featureTypeId(MyFeature.typeName),
  configSpec: myFeatureConfigSpec,
  legacyArgOrder: ['rootNote', 'scale'],
  create(config: MyFeatureConfig, ctx: FeatureContext): Feature {
    return new MyFeature(
      config.rootNote,
      config.scale,
      ctx.settings,
      ctx.constraints.maxHeight,
      ctx.constraints.maxWidth,
    );
  },
};
```

`legacyArgOrder` lists config keys in the same order as the old positional `string[]`
config array, so saved schedule configs deserialise correctly.  If the last field is a
variable-length array (e.g. a chord list), also set `legacyVariadicTail: 'fieldName'`.

### 2d. Register the spec

In `ts/fretboard/fretboard_category.ts`, import the spec and call
`registerFeatureSpec` inside the `InstrumentCategory` constructor:

```ts
import { MyFeatureSpec } from './features/my_feature';
// inside constructor:
registerFeatureSpec(MyFeatureSpec as any);
```

---

## 3. Implement a standalone view (if needed)

For non-fretboard views, create `ts/modules/my_view/my_view.ts`
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

## 4. Build

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
| `drive.targets` | no | Drive target slots — declares inputs for the link panel UI |
| `drive.broadcast` | no | `true` to broadcast signals to all panels (Global Key pattern) |
| `state.decode` | no | Decodes persisted state for type-safe `createView` |
| `createView` | yes | Factory: `(ctx: ViewContext, state?) => View` |

---

## FeatureSpec / ConfigSpec field reference

Each key in `ConfigSpec<C>` is a `FieldSpec<T>` with these properties:

| Property | Required | Description |
|----------|----------|-------------|
| `label` | yes | Label shown above the field in the config UI |
| `codec` | yes | `FieldCodec<T>` — serialise/deserialise to/from `string` |
| `default` | yes | Default value when no saved config exists |
| `ui` | yes | UI widget: `select`, `toggle`, `number`, `toggle-buttons`, or `custom` |
| `drivable` | no | Declares which signal kinds can drive this field and how to resolve them |
| `controls` | no | `'chords'` — hides sibling chord fields when this field changes |

Built-in codecs (from `ts/core/config/codecs.ts`):

| Codec | Type | Notes |
|-------|------|-------|
| `enumCodec(values)` | `string` | Validates against a fixed list |
| `numberCodec` | `number` | `Number()` parse |
| `booleanCodec` | `boolean` | `'true'` / `'false'` |
| `stringArrayCodec` | `string[]` | Only valid as `legacyVariadicTail` |

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
