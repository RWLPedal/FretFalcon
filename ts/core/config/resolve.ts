// ts/core/config/resolve.ts

import type { DrivenConfig, DrivenState } from './spec';

/**
 * Resolves a DrivenConfig against the current DrivenState to produce a plain config object.
 *
 * A driven field whose source has not signalled yet has no value of its own. It takes
 * the one from `fallback` (the last config that resolved) when there is one, so the
 * rest of the config — and the panel's size — can still change while it waits. With no
 * fallback the result is null: nothing has ever been drawn, and the caller waits for
 * the first signal.
 */
export function resolveConfig<C>(
  dc: DrivenConfig<C>,
  driven: DrivenState,
  fallback: C | null = null,
): C | null {
  const result: Partial<C> = {};
  for (const key of Object.keys(dc) as (keyof C)[]) {
    const cv = dc[key];
    if (cv.mode === 'literal') {
      result[key] = (cv as { mode: 'literal'; value: C[typeof key] }).value;
    } else if (cv.mode === 'driven') {
      const cached = driven.current.get(key as string);
      if (cached !== undefined) result[key] = cached as C[typeof key];
      else if (fallback) result[key] = fallback[key];
      else return null;
    } else {
      // drivenNext
      const cached = driven.next.get(key as string);
      if (cached !== undefined) result[key] = cached as C[typeof key];
      else if (fallback) result[key] = fallback[key];
      else return null;
    }
  }
  return result as C;
}
