// ts/panels/panel_manager.ts
// Re-export shim. FloatingViewManager has been superseded by PanelHost in
// panel_host.ts. This file keeps old import paths working during migration.
export { PanelHost, PanelHost as FloatingViewManager } from './panel_host';
