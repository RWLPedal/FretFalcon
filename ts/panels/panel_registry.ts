import { FloatingViewDescriptor } from "./floating_view_types";

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
  console.log(
    `Registered Floating View: <span class="math-inline">\{descriptor\.displayName\} \(</span>{descriptor.viewId})`
  );
}

export function getFloatingViewDescriptor(
  viewId: string
): FloatingViewDescriptor | undefined {
  return registry.get(viewId);
}

export function getAvailableFloatingViews(): FloatingViewDescriptor[] {
  return Array.from(registry.values());
}
