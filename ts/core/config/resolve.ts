// ts/core/config/resolve.ts

import type { DrivenConfig, DrivenState } from './spec';

/**
 * Resolves a DrivenConfig against the current DrivenState to produce a plain config object.
 * Returns null if any driven field has no cached value yet — the caller should keep the
 * previous render ("wait for first signal" semantics).
 */
export function resolveConfig<C>(dc: DrivenConfig<C>, driven: DrivenState): C | null {
  const result: Partial<C> = {};
  for (const key of Object.keys(dc) as (keyof C)[]) {
    const cv = dc[key];
    if (cv.mode === 'literal') {
      result[key] = (cv as { mode: 'literal'; value: C[typeof key] }).value;
    } else if (cv.mode === 'driven') {
      const cached = driven.current.get(key as string);
      if (cached === undefined) return null;
      result[key] = cached as C[typeof key];
    } else {
      // drivenNext
      const cached = driven.next.get(key as string);
      if (cached === undefined) return null;
      result[key] = cached as C[typeof key];
    }
  }
  return result as C;
}
