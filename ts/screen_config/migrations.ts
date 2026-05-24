// ts/screen_config/migrations.ts
//
// Migration chain for screen configuration versioning.
//
// To add a new version (e.g. V1 → V2):
//   1. Add V2PersistedViewEntry and V2Payload to screen_config_types.ts
//   2. Update CurrentPayload alias to V2Payload
//   3. Bump CURRENT_SCREEN_CONFIG_VERSION to 2
//   4. Write migrateV1ToV2() below
//   5. Append (p) => migrateV1ToV2(p as V1Payload) to MIGRATIONS
//   6. Update default_configs.ts to the new shape
//   7. Update SCREEN_CONFIG_FORMAT.md

import { LinkRecord } from "../panels/link_types";
import {
  CURRENT_SCREEN_CONFIG_VERSION,
  CurrentPayload,
  V0Payload,
  V1Payload,
  V2Payload,
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

/** V0 (legacy, no version field) → V1.
 *  The unversioned blob is structurally equivalent to V1Payload.
 *  We only normalise missing optional fields to safe defaults. */
function migrateV0ToV1(raw: V0Payload): V1Payload {
  return {
    referenceGrid: raw.referenceGrid ?? { cols: 80, rows: 60 },
    openViews: (raw.openViews ?? {}) as V1Payload["openViews"],
    nextZIndex: raw.nextZIndex ?? 100,
    links: (raw.links ?? []) as LinkRecord[],
  };
}

/** V1 → V2: adds customTunings field (empty by default). */
function migrateV1ToV2(v1: V1Payload): V2Payload {
  return { ...v1, customTunings: {} };
}

// ─── Migration chain ──────────────────────────────────────────────────────────

// Index N transforms payload_N → payload_N+1.
// MIGRATIONS[0] = V0→V1, MIGRATIONS[1] = V1→V2, etc.
const MIGRATIONS: Array<(payload: unknown) => unknown> = [
  (p) => migrateV0ToV1(p as V0Payload),
  (p) => migrateV1ToV2(p as V1Payload),
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

/**
 * Takes any raw parsed JSON value — a versioned envelope, a legacy unversioned
 * blob, or unknown garbage — applies all needed migrations in sequence, and
 * returns a CurrentPayload.
 *
 * Throws MigrationError if a migration step fails.
 * Throws FutureVersionError if the stored version exceeds CURRENT_SCREEN_CONFIG_VERSION.
 *   In that case callers must NOT overwrite storage (the user may be on an older build).
 */
export function migrate(raw: unknown): CurrentPayload {
  let version: number;
  let payload: unknown;

  if (isVersionedEnvelope(raw)) {
    version = raw.version;
    payload = raw.payload;
  } else {
    // Legacy: no version field — treat as V0.
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
