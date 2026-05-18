// ts/screen_config/default_configs.ts
//
// Bundled starter layouts as TypeScript constants. These are always at the
// current payload shape, so they never need migration at runtime.
//
// To add a new starter layout:
//   1. Define a new Readonly<CurrentPayload> constant here.
//   2. Add it to DEFAULT_CONFIGS with a descriptive key.
//   3. It becomes accessible via ScreenConfigManager.loadNamed("default:<key>").

import { CurrentPayload } from "./screen_config_types";

// ─── Built-in layouts ─────────────────────────────────────────────────────────

/** An empty canvas — no open views, no links. Used as the safe fallback when
 *  localStorage is empty or a migration fails unrecoverably. */
export const EMPTY_CONFIG: Readonly<CurrentPayload> = Object.freeze({
  referenceGrid: { cols: 80, rows: 60 },
  openViews: {},
  nextZIndex: 100,
  links: [],
});

/** General-purpose reference layout: Notes and Scales side-by-side across the
 *  top half, Color Legend and Metronome filling the bottom half. Works for all
 *  supported instruments since it avoids guitar-only views (CAGED, Triads). */
export const REFERENCE_LAYOUT: Readonly<CurrentPayload> = Object.freeze({
  referenceGrid: { cols: 160, rows: 77 },
  nextZIndex: 144,
  links: [
    { id: "link-1", sourceInstanceId: "fv-8", sourceHandle: "bottom" as const, targetInstanceId: "fv-6", targetHandle: "top" as const },
    { id: "link-2", sourceInstanceId: "fv-8", sourceHandle: "right" as const, targetInstanceId: "fv-7", targetHandle: "left" as const },
    { id: "link-3", sourceInstanceId: "fv-8", sourceHandle: "bottom" as const, targetInstanceId: "fv-9", targetHandle: "left" as const },
  ],
  openViews: {
    "fv-6": {
      instanceId: "fv-6",
      viewId: "configurable_instrument_feature",
      gridPosition: { col: 17, row: 33 },
      gridSize: { cols: 67, rows: 34 },
      zIndex: 140,
      viewState: { featureTypeName: "Triad Shapes", config: ["G", "Major"] },
    },
    "fv-7": {
      instanceId: "fv-7",
      viewId: "configurable_instrument_feature",
      gridPosition: { col: 86, row: 1 },
      gridSize: { cols: 24, rows: 66 },
      zIndex: 142,
      viewState: { featureTypeName: "Chord", config: ["G", "Major"], configCollapsed: true },
    },
    "fv-8": {
      instanceId: "fv-8",
      viewId: "configurable_instrument_feature",
      gridPosition: { col: 17, row: 1 },
      gridSize: { cols: 67, rows: 28 },
      zIndex: 141,
      viewState: { featureTypeName: "Scale", config: ["Major", "G"] },
    },
    "fv-9": {
      instanceId: "fv-9",
      viewId: "instrument_chord_progression",
      gridPosition: { col: 112, row: 1 },
      gridSize: { cols: 35, rows: 66 },
      zIndex: 143,
      viewState: { featureTypeName: "Chord Progression", config: ["G", "Major", "I", "IV", "V"] },
    },
  },
});

/** Practice layout centred on an indie rock backing track. The drum machine
 *  loads with a pre-built 8-bar pattern (C Major, 118 BPM). A scale reference
 *  and timer fill the right column so you can stay focused while practising. */
export const PRACTICE_LAYOUT: Readonly<CurrentPayload> = Object.freeze({
  referenceGrid: { cols: 160, rows: 77 },
  nextZIndex: 124,
  links: [
    { id: "link-3", sourceInstanceId: "fv-1", sourceHandle: "bottom" as const, targetInstanceId: "fv-5", targetHandle: "top" as const },
  ],
  openViews: {
    "fv-1": {
      instanceId: "fv-1",
      viewId: "drum_machine",
      gridPosition: { col: 17, row: 1 },
      gridSize: { cols: 54, rows: 33 },
      zIndex: 123,
      viewState: {
        bpm: 75,
        steps: 16,
        numMeasures: 8,
        progRootNote: "C",
        progKeyType: "Major",
        measureChords: ["I", "I", "V", "V", "vi", "vi", "IV", "IV"],
        tracks: [
          ["kick",  null,    null,    null, null,    null, "kick",  null, "kick",   null, null, null, null,    null, null, null],
          [null,    null,    null,    null, "snare", null, null,    null, null,     null, null, null, "snare", null, null, null],
          ["hihat", null,    "hihat", null, "hihat", null, "hihat", null, "hihat",  null, "hihat", null, "hihat", null, "hihat", null],
          ["crash", null,    "shaker", null, "shaker", null, "shaker", null, "shaker", null, "shaker", null, "shaker", null, "shaker", null],
        ],
        bassTrack: [1, null, null, null, null, null, null, null, 5, null, null, null, null, null, 7, null],
      },
    },
    "fv-4": {
      instanceId: "fv-4",
      viewId: "floating_timer",
      gridPosition: { col: 72, row: 1 },
      gridSize: { cols: 28, rows: 26 },
      zIndex: 120,
      viewState: { duration: 300 },
    },
    "fv-5": {
      instanceId: "fv-5",
      viewId: "configurable_instrument_feature",
      gridPosition: { col: 17, row: 37 },
      gridSize: { cols: 82, rows: 34 },
      zIndex: 121,
      viewState: {
        featureTypeName: "MultiLayerFretboard",
        config: ["chord|driven|var(--dm-palette-2)", "scale|driven|driven|var(--dm-palette-3)"],
      },
    },
    "fv-6": {
      instanceId: "fv-6",
      viewId: "drone_view",
      gridPosition: { col: 72, row: 28 },
      gridSize: { cols: 15, rows: 8 },
      zIndex: 122,
      viewState: { note: "A" },
    },
  },
});

// ─── Registry ─────────────────────────────────────────────────────────────────

/** All built-in presets. Keys are accessed via the "default:" namespace in
 *  ScreenConfigManager, e.g. screenConfigManager.loadNamed("default:empty"). */
export const DEFAULT_CONFIGS: Readonly<Record<string, CurrentPayload>> = Object.freeze({
  empty: EMPTY_CONFIG,
  reference: REFERENCE_LAYOUT,
  practice: PRACTICE_LAYOUT,
});
