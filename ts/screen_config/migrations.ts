// ts/screen_config/migrations.ts
//
// Migration chain for screen configuration versioning.
//
// To add a new version (e.g. V2 → V3):
//   1. Add V3PersistedViewEntry and V3Payload to screen_config_types.ts
//   2. Update CurrentPayload alias to V3Payload
//   3. Bump CURRENT_SCREEN_CONFIG_VERSION to 3
//   4. Write migrateV2ToV3() below
//   5. Append (p) => migrateV2ToV3(p as V2Payload) to MIGRATIONS
//   6. Update default_configs.ts to the new shape
//   7. Update SCREEN_CONFIG_FORMAT.md

import { LinkRecord } from "../panels/link_types";
import {
  CURRENT_SCREEN_CONFIG_VERSION,
  CurrentPayload,
  V0Payload,
  V1Payload,
  V2Payload,
  V3Payload,
  VersionedScreenConfig,
} from "./screen_config_types";

// ─── Error types ──────────────────────────────────────────────────────────────

export class MigrationError extends Error {
  constructor(message: string, public readonly fromVersion: number) {
    super(message);
    this.name = "MigrationError";
  }
}

export class FutureVersionError extends Error {
  constructor(public readonly foundVersion: number) {
    super(
      `Saved config is version ${foundVersion}, but this app supports up to ` +
      `version ${CURRENT_SCREEN_CONFIG_VERSION}. Storage left intact.`
    );
    this.name = "FutureVersionError";
  }
}

// ─── Per-version migration functions ─────────────────────────────────────────

function migrateV0ToV1(raw: V0Payload): V1Payload {
  return {
    referenceGrid: raw.referenceGrid ?? { cols: 80, rows: 60 },
    openViews: (raw.openViews ?? {}) as V1Payload["openViews"],
    nextZIndex: raw.nextZIndex ?? 100,
    links: (raw.links ?? []) as LinkRecord[],
  };
}

function migrateV1ToV2(v1: V1Payload): V2Payload {
  return { ...v1, customTunings: {} };
}

/** V2 → V3: split flat openViews into separate instances + layout.floating objects. */
function migrateV2ToV3(v2: V2Payload): V3Payload {
  const instances: V3Payload["instances"] = {};
  const perInstance: Record<string, { gridPosition: { col: number; row: number }; gridSize?: { cols: number; rows: number }; zIndex: number }> = {};

  for (const [id, entry] of Object.entries(v2.openViews ?? {})) {
    instances[id] = {
      instanceId: entry.instanceId,
      viewId: entry.viewId,
      viewState: entry.viewState,
      collapsed: (entry as any).collapsed,
      orientationOverride: entry.orientationOverride,
      zoomActive: entry.zoomActive,
    };
    perInstance[id] = {
      gridPosition: entry.gridPosition,
      gridSize: entry.gridSize,
      zIndex: entry.zIndex,
    };
  }

  return {
    instances,
    links: v2.links ?? [],
    layout: {
      floating: {
        referenceGrid: v2.referenceGrid,
        nextZIndex: v2.nextZIndex,
        perInstance,
      },
    },
    customTunings: v2.customTunings,
  };
}

// ─── Migration chain ──────────────────────────────────────────────────────────

// Index N transforms payload_N → payload_N+1.
const MIGRATIONS: Array<(payload: unknown) => unknown> = [
  (p) => migrateV0ToV1(p as V0Payload),
  (p) => migrateV1ToV2(p as V1Payload),
  (p) => migrateV2ToV3(p as V2Payload),
];

// ─── Envelope detection ───────────────────────────────────────────────────────

function isVersionedEnvelope(raw: unknown): raw is VersionedScreenConfig {
  return (
    raw !== null &&
    typeof raw === "object" &&
    "version" in (raw as object) &&
    typeof (raw as VersionedScreenConfig).version === "number" &&
    "payload" in (raw as object)
  );
}

// ─── Public entry point ───────────────────────────────────────────────────────

export function migrate(raw: unknown): CurrentPayload {
  let version: number;
  let payload: unknown;

  if (isVersionedEnvelope(raw)) {
    version = raw.version;
    payload = raw.payload;
  } else {
    version = 0;
    payload = raw;
  }

  if (version > CURRENT_SCREEN_CONFIG_VERSION) {
    throw new FutureVersionError(version);
  }

  for (let v = version; v < CURRENT_SCREEN_CONFIG_VERSION; v++) {
    try {
      payload = MIGRATIONS[v](payload);
    } catch (e) {
      throw new MigrationError(
        `Migration step v${v}→v${v + 1} failed: ${(e as Error).message}`,
        v
      );
    }
  }

  return payload as CurrentPayload;
}
