// ts/core/config/feature_spec_registry.ts
// Registry for the new FeatureSpec descriptors, parallel to feature_registry.ts.
// Populated by each feature as it migrates from FeatureTypeDescriptor to FeatureSpec.

import type { FeatureSpec } from '../../feature';

const registry = new Map<string, FeatureSpec<unknown>>();

/** Register a typed FeatureSpec. Key is the typeName string (matches legacy featureTypeName in viewState). */
export function registerFeatureSpec(spec: FeatureSpec<unknown>): void {
  registry.set(spec.id as string, spec);
}

/** Look up a FeatureSpec by its typeName string. Returns undefined if not yet migrated. */
export function getFeatureSpec(typeName: string): FeatureSpec<unknown> | undefined {
  return registry.get(typeName);
}

/** Returns all registered FeatureSpecs (used by menus). */
export function getAllFeatureSpecs(): ReadonlyMap<string, FeatureSpec<unknown>> {
  return registry;
}
