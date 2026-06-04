import { FloatingViewDescriptor } from "./panel_types";

const registry = new Map<string, FloatingViewDescriptor>();

export function registerFloatingView(descriptor: FloatingViewDescriptor): void {
  if (!descriptor || !descriptor.viewId) {
    console.error(
      "Cannot register floating view: Invalid descriptor.",
      descriptor
    );
    return;
  }
  if (registry.has(descriptor.viewId)) {
    console.warn(
      `Floating view ID "${descriptor.viewId}" is already registered. Overwriting.`
    );
  }
  registry.set(descriptor.viewId, descriptor);
}

export function getFloatingViewDescriptor(
  viewId: string
): FloatingViewDescriptor | undefined {
  return registry.get(viewId);
}

export function getAvailableFloatingViews(): FloatingViewDescriptor[] {
  return Array.from(registry.values());
}

export function getViewIcon(viewId: string): string {
  return registry.get(viewId)?.icon ?? 'widgets';
}

export function getViewIconByFeatureType(featureTypeName: string): string | undefined {
  for (const d of registry.values()) {
    if (d.featureTypeName === featureTypeName) return d.icon;
  }
  return undefined;
}
