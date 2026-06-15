# Screen Configuration Format

This document describes the format used to persist and restore screen layouts (floating view positions, sizes, links, and view-specific state) in FretFalcon.

---

## Purpose

Screen configurations are saved to `localStorage` automatically whenever the layout changes (view opened, moved, resized, linked, or closed). On page load the saved state is restored. The system is versioned so that changes to the schema can be applied transparently without losing users' saved layouts.

All persistence logic lives in `ts/screen_config/`. `PanelHost` and all other code interact only with `ScreenConfigManager` and never read or write `localStorage` directly for layout state.

---

## Storage keys

| Key | Context | Purpose |
|-----|---------|---------|
| `floatingViewStates_reference` | Reference page | Auto-save slot for the current layout |
| `savedScreenConfigs` | Shared | Named user-saved presets (all contexts) |

---

## Envelope format

Every value written to `localStorage` is wrapped in a `VersionedScreenConfig` envelope:

```json
{
  "version": 3,
  "savedAt": "2026-06-12T12:34:56.789Z",
  "context": "reference",
  "payload": { ... }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `version` | `number` | Schema version of the `payload` object. Used by the migration chain. |
| `savedAt` | `string` (ISO-8601) | Timestamp written at save time. Informational only. |
| `context` | `string` | Which page saved this (`"reference"` or `"practice"`). Informational only. |
| `payload` | `object` | The version-specific layout data. See below. |

**Detection of legacy data:** If a stored value has no `version` field, it is treated as V0 (pre-versioning legacy format) and migrated automatically.

---

## V3 payload (current version)

`CURRENT_SCREEN_CONFIG_VERSION = 3`

V3 separates layout-independent instance data (what views are open and their view-specific state) from layout-strategy geometry (where floating windows are positioned). This allows both layout strategies — floating and tabbed — to coexist in storage so that switching form factors (e.g. desktop ↔ mobile) does not lose layout state.

```json
{
  "instances": {
    "fv-1": {
      "instanceId": "fv-1",
      "viewId": "configurable_instrument_feature",
      "viewState": { "featureTypeName": "Scale", "config": ["C", "Major"] },
      "orientationOverride": "horizontal",
      "zoomActive": false
    }
  },
  "links": [
    {
      "id": "link-1",
      "sourceInstanceId": "fv-1",
      "sourceHandle": "right",
      "targetInstanceId": "fv-2",
      "targetHandle": "left"
    }
  ],
  "layout": {
    "floating": {
      "referenceGrid": { "cols": 120, "rows": 80 },
      "nextZIndex": 104,
      "perInstance": {
        "fv-1": {
          "gridPosition": { "col": 10, "row": 5 },
          "gridSize": { "cols": 40, "rows": 30 },
          "zIndex": 101
        }
      }
    },
    "tabbed": {
      "order": ["fv-1", "fv-2"],
      "activeId": "fv-1"
    }
  },
  "customTunings": {}
}
```

### Top-level fields

| Field | Type | Description |
|-------|------|-------------|
| `instances` | `Record<instanceId, V3PersistedViewEntry>` | Layout-strategy-independent data for each open panel. |
| `links` | `LinkRecord[]` | All inter-view connections. Always an array (empty if none). |
| `layout` | `object` | Strategy-specific geometry. Both `floating` and `tabbed` may coexist. |
| `customTunings` | `object` *(optional)* | User-defined tunings, keyed by instrument name. Present in exports. |

### Per-instance fields (`V3PersistedViewEntry`)

| Field | Type | Description |
|-------|------|-------------|
| `instanceId` | `string` | Stable runtime ID, e.g. `"fv-3"`. Preserved across saves so links survive. |
| `viewId` | `string` | The registered view type, e.g. `"configurable_instrument_feature"`. |
| `viewState` | `unknown` *(optional)* | **Opaque blob owned by the view.** See "View state opacity" below. |
| `collapsed` | `boolean` *(optional)* | Whether the panel's config section is collapsed. |
| `orientationOverride` | `"vertical" \| "horizontal"` *(optional)* | Per-instance orientation override. Absent means follow the global instrument setting. |
| `zoomActive` | `boolean` *(optional)* | Whether this instance is in the zoomed state. |

### Floating layout data (`layout.floating`)

| Field | Type | Description |
|-------|------|-------------|
| `referenceGrid` | `{ cols, rows }` | Viewport size in grid units at save time. Used to scale positions proportionally when loading on a different screen size. |
| `nextZIndex` | `number` | The next z-index value to assign to a newly spawned view. |
| `perInstance` | `Record<instanceId, V3FloatingPerInstance>` | Per-instance geometry (position, size, z-index). |

### Per-instance floating geometry (`V3FloatingPerInstance`)

| Field | Type | Description |
|-------|------|-------------|
| `gridPosition` | `{ col, row }` | Position in `GRID_UNIT`-sized (12px) cells at save time. |
| `gridSize` | `{ cols, rows }` *(optional)* | Size in grid cells. Absent if the view has never been resized. |
| `zIndex` | `number` | Stacking order. |

### Tabbed layout data (`layout.tabbed`)

| Field | Type | Description |
|-------|------|-------------|
| `order` | `string[]` | Instance IDs in tab bar order. |
| `activeId` | `string` *(optional)* | The currently visible tab. |

---

## Migration history

### V2 → V3

The flat `openViews` map (which mixed instance identity with floating geometry) was split into:
- `instances` — layout-strategy-independent data (viewId, viewState, orientationOverride, zoomActive)
- `layout.floating.perInstance` — floating geometry (gridPosition, gridSize, zIndex)

The top-level `referenceGrid` and `nextZIndex` moved into `layout.floating`.

The migration in `migrateV2ToV3` performs this split automatically for all existing saved layouts.

### V1 → V2

Added optional `customTunings` field to support export/import of user-defined tunings.

### V0 → V1

Normalised optional fields (`referenceGrid`, `nextZIndex`, `links`) to required fields with defaults.

---

## Legacy / V0

Data written before versioning was introduced has no `version` field:

```json
{
  "referenceGrid": { "cols": 80, "rows": 60 },
  "nextZIndex": 100,
  "openViews": { ... },
  "links": []
}
```

**Detection:** absence of a `"version"` key. The migration system treats this as version 0 and runs it through V0→V1→V2→V3 automatically.

---

## View state opacity

The `viewState` field in each instance entry is a blob that the individual view writes and reads back. **The persistence layer stores and restores it without interpreting it.** When `PanelHost` recreates a view, it passes the blob directly to `descriptor.createView(savedEntry.viewState, settings)`.

This means the central migration system cannot migrate view-specific state — and it shouldn't. The correct pattern for a view whose internal state format needs to change:

1. Include a version marker inside `viewState`, e.g. `{ _v: 2, note: "C#", ... }`.
2. Handle the upgrade in the view's own `createView()` function.

---

## Named presets

User-saved presets are stored under the `"savedScreenConfigs"` key as a flat map:

```json
{
  "my-layout": {
    "name": "my-layout",
    "description": "Scale practice setup",
    "createdAt": "2026-06-12T10:00:00.000Z",
    "config": {
      "version": 3,
      "savedAt": "2026-06-12T10:00:00.000Z",
      "context": "reference",
      "payload": { ... }
    }
  }
}
```

**`"default:"` namespace:** Names beginning with `"default:"` (e.g. `"default:empty"`) route to the built-in `DEFAULT_CONFIGS` registry in `ts/screen_config/default_configs.ts` and are never stored in `localStorage`. They cannot be overwritten.

---

## Error handling

| Scenario | Behavior | Storage action |
|----------|----------|----------------|
| Key missing from `localStorage` | Return `null`; caller uses empty config | None |
| `JSON.parse` fails | Log warning, return `null` | `removeItem` (corrupt data) |
| Valid JSON, missing/unknown fields | Defaults applied via V0→V1 migration | Overwritten on next save |
| `version > CURRENT_SCREEN_CONFIG_VERSION` | Log error, return `null` — do **not** overwrite | Storage left intact (user may be on older build) |
| Migration step throws | Log error, return empty config | Overwritten on next save |
| Named preset store corrupt | Reset store to `{}` | `removeItem("savedScreenConfigs")` |
| `localStorage` quota exceeded on save | Log error; previous save remains intact | None |

---

## Adding a new version

When a breaking schema change is needed:

1. Add `V{N+1}PersistedViewEntry` and `V{N+1}Payload` interfaces to `ts/screen_config/screen_config_types.ts`.
2. Update the `CurrentPayload` alias to `V{N+1}Payload`.
3. Bump `CURRENT_SCREEN_CONFIG_VERSION` from `N` to `N+1`.
4. Write `migrateV{N}ToV{N+1}(data: V{N}Payload): V{N+1}Payload` in `ts/screen_config/migrations.ts`.
5. Append `(p) => migrateV{N}ToV{N+1}(p as V{N}Payload)` to the `MIGRATIONS` array.
6. Update any built-in configs in `ts/screen_config/default_configs.ts` to the new shape.
7. Update this document: add a new section describing what changed and why.
