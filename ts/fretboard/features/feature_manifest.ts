// ts/fretboard/features/feature_manifest.ts
// Auto-discovers every fretboard feature file (features/*_feature.ts) via webpack
// require.context — the same pattern as ts/modules/manifest.ts. Adding a feature is
// then just: create features/<name>_feature.ts exporting its Feature class and (once
// migrated) its *FeatureSpec — no hand edits to fretboard_category.ts.
//
// Each feature file exports up to two shapes, told apart structurally:
//   • the legacy FeatureTypeDescriptor — the Feature CLASS, with static `typeName`
//     + static `createFeature()`  (every feature has one)
//   • the typed FeatureSpec object — `{ id, configSpec, create() }`  (migrated features)
//
// NEVER import this file from a Vitest test: require.context is a webpack API absent in
// the node test runtime — the feature_manifest architecture test parses source as text
// instead. The esbuild preview build (.claude/preview-build.js) statically shims it.

import type { FeatureTypeDescriptor, FeatureSpec } from "../../feature";

interface WebpackRequireContext {
  keys(): string[];
  (id: string): Record<string, unknown>;
}
declare const require: {
  context(dir: string, recursive: boolean, re: RegExp): WebpackRequireContext;
};

function isDescriptor(v: unknown): v is FeatureTypeDescriptor {
  const o = v as { typeName?: unknown; createFeature?: unknown } | null;
  return typeof o?.typeName === "string" && typeof o?.createFeature === "function";
}
function isSpec(v: unknown): v is FeatureSpec<unknown> {
  const o = v as { id?: unknown; configSpec?: unknown; create?: unknown } | null;
  return typeof o?.id === "string" && !!o?.configSpec && typeof o?.create === "function";
}

const ctx = require.context(".", false, /_feature\.ts$/);

export const FEATURE_DESCRIPTORS: FeatureTypeDescriptor[] = [];
export const FEATURE_SPECS: FeatureSpec<unknown>[] = [];

for (const key of ctx.keys()) {
  for (const exported of Object.values(ctx(key))) {
    if (isDescriptor(exported)) FEATURE_DESCRIPTORS.push(exported);
    if (isSpec(exported)) FEATURE_SPECS.push(exported);
  }
}
