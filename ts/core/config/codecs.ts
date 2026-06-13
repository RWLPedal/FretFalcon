// ts/core/config/codecs.ts
// Common FieldCodec implementations for use in ConfigSpec definitions.

import type { FieldCodec } from './spec';

export const stringCodec: FieldCodec<string> = {
  serialize: (v) => v,
  parse: (raw) => raw,
};

export const booleanCodec: FieldCodec<boolean> = {
  serialize: (v) => (v ? 'true' : 'false'),
  parse: (raw) => (raw === 'true' ? true : raw === 'false' ? false : undefined),
};

export const numberCodec: FieldCodec<number> = {
  serialize: (v) => String(v),
  parse: (raw) => {
    const n = Number(raw);
    return isNaN(n) ? undefined : n;
  },
};

/** Codec for a string value restricted to a known set of enum strings. */
export function enumCodec<T extends string>(values: readonly T[]): FieldCodec<T> {
  const set = new Set<string>(values);
  return {
    serialize: (v) => v,
    parse: (raw): T | undefined => (set.has(raw) ? (raw as T) : undefined),
  };
}

/** Codec for a string[] variadic tail where each element is already serialized. */
export const stringArrayCodec: FieldCodec<string[]> = {
  serialize: (_v) => { throw new Error('stringArrayCodec.serialize should not be called directly; use legacyCodec variadicTail'); },
  parse: (_raw) => { throw new Error('stringArrayCodec.parse should not be called directly; use legacyCodec variadicTail'); },
};
