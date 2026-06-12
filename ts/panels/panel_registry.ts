import { FloatingViewDescriptor } from "./panel_types";
import { ViewId, _trackViewId } from "../core/ids";

const registry = new Map<ViewId, FloatingViewDescriptor>();

export function registerFloatingView(descriptor: FloatingViewDescriptor): void {
  if (!descriptor || !descriptor.viewId) {
    console.error(
      "Cannot register floating view: Invalid descriptor.",
      descriptor
    );
    return;
  }
  if (registry.has(descriptor.viewId)) {
    throw new Error(
      `Duplicate floating view ID "${descriptor.viewId}". Each view ID must be unique.`
    );
  }
  _trackViewId(descriptor.viewId);
  registry.set(descriptor.viewId, descriptor);
}

export function getFloatingViewDescriptor(
  viewId: ViewId | string
): FloatingViewDescriptor | undefined {
  return registry.get(viewId as ViewId);
}

export function getAvailableFloatingViews(): FloatingViewDescriptor[] {
  return Array.from(registry.values());
}

export function getViewIcon(viewId: ViewId | string): string {
  return registry.get(viewId as ViewId)?.icon ?? 'widgets';
}

export function getViewIconByFeatureType(featureTypeName: string): string | undefined {
  for (const d of registry.values()) {
    if (d.featureTypeName === featureTypeName) return d.icon;
  }
  return undefined;
}
