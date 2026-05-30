import { FeatureTypeDescriptor } from "./feature";
import { Category } from "./feature";

/** Stores FeatureTypeDescriptors, keyed by "CategoryName/TypeName" for quick lookup */
const featureTypeRegistry = new Map<string, FeatureTypeDescriptor>();

/**
 * Registers all feature types from a category instance.
 * Called once during bootstrap to populate the feature type registry.
 */
export function registerCategory(categoryInstance: Category): void {
  const categoryName = categoryInstance.getName();
  if (!categoryName || typeof categoryName !== "string") {
    console.error(
      "Cannot register category: Instance is missing a valid getName() method.",
      categoryInstance
    );
    return;
  }

  const featureTypes = categoryInstance.getFeatureTypes();

  featureTypes.forEach((featureType, typeName) => {
    if (!typeName || typeof typeName !== "string") {
      console.warn(
        `Skipping feature registration for category "${categoryName}": Invalid typeName found.`,
        featureType
      );
      return;
    }
    const fullKey = `${categoryName}/${typeName}`;
    if (
      typeof featureType?.createFeature !== "function" ||
      typeof featureType?.getConfigurationSchema !== "function"
    ) {
      console.warn(
        `Skipping feature registration for "${fullKey}": Invalid FeatureTypeDescriptor (missing createFeature or getConfigurationSchema).`,
        featureType
      );
      return;
    }
    featureTypeRegistry.set(fullKey, featureType);
  });

}

/**
 * Retrieves the descriptor for a specific feature type.
 */
export function getFeatureTypeDescriptor(
  categoryName: string,
  typeName: string
): FeatureTypeDescriptor | undefined {
  if (!categoryName || !typeName) return undefined;
  return featureTypeRegistry.get(`${categoryName}/${typeName}`);
}

/**
 * Retrieves all available feature type descriptors for a given category.
 */
export function getAvailableFeatureTypes(
  categoryName: string
): FeatureTypeDescriptor[] {
  const results: FeatureTypeDescriptor[] = [];
  const prefix = `${categoryName}/`;
  featureTypeRegistry.forEach((ft, key) => {
    if (key.startsWith(prefix)) results.push(ft);
  });
  return results;
}

/**
 * Retrieves feature type descriptors for a given category, filtered to those
 * compatible with the specified instrument and optional tuning. Features without
 * `requiredInstruments` are always included; `isCompatibleWithTuning` provides
 * a further optional gate.
 */
export function getAvailableFeatureTypesForInstrument(
  categoryName: string,
  instrument: string,
  tuningName?: string
): FeatureTypeDescriptor[] {
  return getAvailableFeatureTypes(categoryName).filter((ft) => {
    if (ft.requiredInstruments && !ft.requiredInstruments.includes(instrument)) return false;
    if (tuningName && ft.isCompatibleWithTuning && !ft.isCompatibleWithTuning(instrument, tuningName)) return false;
    return true;
  });
}
