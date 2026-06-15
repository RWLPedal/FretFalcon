// ts/reference_page/url_params.ts
//
// Boot-time URL parameters that control the reference page's initial behavior.
// These make individual layouts / settings shareable/bookmarkable, e.g.
//
//   /?layout=reference        open with the Reference preset
//   /?layout=backing          open with the Backing track preset
//   /?lefty                   open with left-handed fretboards
//   /?lefty=false             force right-handed (override a saved preference)
//   /?tutorial=true           open with the onboarding welcome modal
//                             (handled in onboarding/onboarding_tour.ts)
//
// The ?layout value is a key from DEFAULT_CONFIGS (see screen_config/
// default_configs.ts) — the same bare keys used in the sidebar picker. A
// "default:"-prefixed value is also accepted for convenience.
//
// All params here use apply-once semantics: each is stripped from the address
// bar when read, so a later manual reload restores the user's own saved state
// rather than re-applying the shared override.

import { ScreenConfigManager } from "../screen_config/screen_config_manager";
import { CurrentPayload } from "../screen_config/screen_config_types";

/** The query-string key that selects a built-in starter layout. */
export const LAYOUT_PARAM = "layout";
/** The query-string key that selects left-handed fretboards. */
export const LEFTY_PARAM = "lefty";

/**
 * Read a query parameter and immediately strip it from the address bar
 * (apply-once semantics) so it never survives a reload. Returns the raw string
 * value (possibly empty), or null when the param is absent — in which case the
 * URL is left untouched.
 */
function consumeParam(key: string): string | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  if (!params.has(key)) return null;
  const raw = params.get(key) ?? "";

  params.delete(key);
  const qs = params.toString();
  const newUrl =
    window.location.pathname +
    (qs ? `?${qs}` : "") +
    window.location.hash;
  window.history.replaceState(null, "", newUrl);

  return raw;
}

/**
 * Read the ?layout=<key> URL parameter and resolve it to a built-in preset
 * payload. The param is always consumed (stripped from the URL); a later reload
 * restores the user's auto-saved layout rather than re-applying — and clobbering
 * — the preset.
 *
 * Returns the resolved payload, or null when the param is absent/empty or names
 * an unknown preset (the caller should fall back to the auto-save).
 */
export function consumeLayoutParam(
  scm: ScreenConfigManager,
): CurrentPayload | null {
  const raw = consumeParam(LAYOUT_PARAM);
  if (raw === null) return null;

  const key = raw.trim();
  if (!key) return null;
  const name = key.startsWith("default:") ? key : `default:${key}`;
  return scm.loadNamed(name);
}

/**
 * Read the ?lefty[=true|false] URL parameter and resolve it to a handedness
 * setting. Presence with a truthy or empty value selects "left"; an explicit
 * falsy value ("false"/"0"/"no"/"off") selects "right" — useful for overriding
 * a previously-saved left-handed preference via a shared link. The param is
 * always consumed (stripped from the URL).
 *
 * Returns the desired handedness, or null when the param is absent.
 */
export function consumeLeftyParam(): "left" | "right" | null {
  const raw = consumeParam(LEFTY_PARAM);
  if (raw === null) return null;

  const v = raw.trim().toLowerCase();
  const falsy = v === "false" || v === "0" || v === "no" || v === "off";
  return falsy ? "right" : "left";
}
