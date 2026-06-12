// ts/modules/manifest.ts
// Auto-discovers all ViewModule default exports from ts/modules/*/module.ts.
// Uses webpack's require.context — NEVER import this file from vitest tests.
// Tests import individual module files directly.

import { ViewModule } from './module_types';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ctx = (require as any).context('.', true, /\/module\.ts$/);

export const VIEW_MODULES: ViewModule[] = ctx.keys().map(
  (k: string) => (ctx(k) as { default: ViewModule }).default,
);
