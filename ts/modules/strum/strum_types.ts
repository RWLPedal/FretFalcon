// Shared types for strum_view.ts and strum_presets.ts.
// Keep this file free of cross-imports to avoid circular dependencies.

export enum StrokeAction {
  Rest   = 'rest',
  Stroke = 'stroke',
  Accent = 'accent',
  Chuck  = 'chuck',
  Air    = 'air',
}

export interface StrumPreset {
  _v: 1;
  id: string;
  name: string;
  instrument: string;
  timeSig: { beats: number; division: number };
  subdivision: 'eighth' | 'sixteenth';
  slots: StrokeAction[];
  isBuiltIn: boolean;
}
