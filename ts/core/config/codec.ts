// ts/core/config/codec.ts
// The schedule-boundary bridge: encode DrivenConfig to/from legacy positional string arrays.

import type { ConfigSpec, DrivenConfig, ConfigValue } from './spec';

/**
 * Creates encode/decode functions bridging typed DrivenConfig and the legacy positional
 * string-array boundary (FeatureSignal.config, persistence, feature-state-changed events).
 *
 * @param spec        The ConfigSpec for the feature type.
 * @param argOrder    Ordered field keys matching the legacy positional array. Must be exact.
 * @param variadicTail  Optional last key whose value is string[] (occupies all remaining positions).
 *
 * WARNING: wrong argOrder silently mis-drives saved schedules.
 * Always assert encode/decode against literal preset strings in tests.
 */
export function legacyCodec<C>(
  spec: ConfigSpec<C>,
  argOrder: (keyof C)[],
  variadicTail?: keyof C,
): {
  encode(c: DrivenConfig<C>): string[];
  decode(raw: ReadonlyArray<string>): DrivenConfig<C>;
} {
  return {
    encode(c: DrivenConfig<C>): string[] {
      const result: string[] = [];
      for (const key of argOrder) {
        if (key === variadicTail) break;
        const cv = c[key] as ConfigValue<unknown>;
        if (cv.mode === 'driven') {
          result.push('driven');
        } else if (cv.mode === 'drivenNext') {
          result.push('driven_next');
        } else {
          result.push((spec[key] as any).codec.serialize(cv.value));
        }
      }
      if (variadicTail !== undefined) {
        const cv = c[variadicTail] as ConfigValue<unknown>;
        if (cv.mode === 'driven') {
          result.push('driven');
        } else if (cv.mode === 'drivenNext') {
          result.push('driven_next');
        } else {
          const arr = cv.value as string[];
          result.push(...arr);
        }
      }
      return result;
    },

    decode(raw: ReadonlyArray<string>): DrivenConfig<C> {
      const result: Partial<DrivenConfig<C>> = {};
      let rawIndex = 0;

      for (const key of argOrder) {
        if (key === variadicTail) break;
        const rawVal = raw[rawIndex++];
        const fieldSpec = spec[key] as any;
        (result as any)[key] = parseOneValue(rawVal, fieldSpec.codec, fieldSpec.defaultValue);
      }

      if (variadicTail !== undefined) {
        const remaining = Array.from(raw.slice(rawIndex));
        if (remaining.length === 1 && remaining[0] === 'driven') {
          (result as any)[variadicTail] = { mode: 'driven' };
        } else if (remaining.length === 1 && remaining[0] === 'driven_next') {
          (result as any)[variadicTail] = { mode: 'drivenNext' };
        } else {
          (result as any)[variadicTail] = { mode: 'literal', value: remaining };
        }
      }

      // Fill keys not covered by argOrder with their default (variadic fields already handled).
      for (const key of Object.keys(spec) as (keyof C)[]) {
        if (!(key in result)) {
          (result as any)[key] = { mode: 'literal', value: (spec[key] as any).defaultValue };
        }
      }

      return result as DrivenConfig<C>;
    },
  };
}

function parseOneValue(
  rawVal: string | undefined,
  codec: { parse(r: string): unknown },
  defaultValue: unknown,
): ConfigValue<unknown> {
  if (rawVal === 'driven') return { mode: 'driven' };
  if (rawVal === 'driven_next') return { mode: 'drivenNext' };
  if (rawVal === undefined) return { mode: 'literal', value: defaultValue };
  const parsed = codec.parse(rawVal);
  return { mode: 'literal', value: parsed !== undefined ? parsed : defaultValue };
}
