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
      viewState: { featureTypeName: "Chord Progression", config: ["G", "MAJOR", "0", "3", "4"] },
    },
  },
});

/** Backing track layout centred on an indie rock backing track. The drum machine
 *  loads with a pre-built 8-bar pattern (C Major, 118 BPM). A scale reference
 *  and timer fill the right column so you can stay focused while practising. */
export const BACKING_LAYOUT: Readonly<CurrentPayload> = Object.freeze({
  referenceGrid: { cols: 160, rows: 77 },
  nextZIndex: 136,
  links: [
    { id: "link-3", sourceInstanceId: "fv-1", sourceHandle: "bottom" as const, targetInstanceId: "fv-5", targetHandle: "top" as const },
    { id: "link-4", sourceInstanceId: "fv-1", sourceHandle: "right" as const, targetInstanceId: "fv-7", targetHandle: "left" as const },
    { id: "link-5", sourceInstanceId: "fv-1", sourceHandle: "right" as const, targetInstanceId: "fv-8", targetHandle: "left" as const },
  ],
  openViews: {
    "fv-1": {
      instanceId: "fv-1",
      viewId: "drum_machine",
      gridPosition: { col: 17, row: 1 },
      gridSize: { cols: 54, rows: 33 },
      zIndex: 134,
      viewState: {
        bpm: 79,
        steps: 16,
        numMeasures: 8,
        progRootNote: "C",
        progMode: "MAJOR",
        measureChords: [1, 1, 5, 5, 6, 6, 4, 4],
        tracks: [
          ["kick",  null,    null,    null, null,    null, "kick",    null, "kick",    null, null,    null, null,    null,    null,    null],
          [null,    null,    null,    null, "snare",  null, null,    null,  null,      null, null,    null, "snare", null,    null,    null],
          ["hihat", null,    "hihat", null, "hihat", null, "hihat",   null, "hihat",   null, "hihat", null, "hihat", null,    "hihat", null],
          ["crash", null,    "shaker", null, "shaker", null, "shaker", null, "shaker", null, "shaker", null, "shaker", null, "shaker", null],
        ],
        bassTrack: [1, null, null, null, null, null, null, null, 5, null, null, null, null, null, 7, null],
        swingAmount: 0,
        trackSounds: ["kick", "snare", "hihat", "crash"],
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
      zIndex: 131,
      viewState: {
        featureTypeName: "MultiLayerFretboard",
        config: [
          "chord|driven|var(--dm-palette-2)|none",
          "chord|driven_next|none|var(--dm-palette-4)",
          "scale|driven|driven|var(--dm-palette-3)|none",
        ],
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
    "fv-7": {
      instanceId: "fv-7",
      viewId: "configurable_instrument_feature",
      gridPosition: { col: 102, row: 1 },
      gridSize: { cols: 27, rows: 26 },
      zIndex: 136,
      viewState: { featureTypeName: "Chord", config: ["driven", "driven"] },
    },
    "fv-8": {
      instanceId: "fv-8",
      viewId: "configurable_instrument_feature",
      gridPosition: { col: 102, row: 30 },
      gridSize: { cols: 27, rows: 26 },
      zIndex: 135,
      viewState: { featureTypeName: "Chord", config: ["driven_next", "driven_next"] },
    },
  },
});

// ─── Practice layout schedule data ───────────────────────────────────────────

// #floating-view-area covers the full page width; the sidebar occupies the
// first 192px (16 grid units at GRID_UNIT=12). All views start at col ≥ 17.
const _MINOR_WORKOUT_SCHEDULE = JSON.stringify({
  name: "A Minor Workout",
  items: [
    { rowType: "group", level: 1, name: "Warmup" },
    {
      rowType: "interval", duration: "3:00",
      task: "Fretboard survey — no labels, find the notes by ear",
      categoryName: "Instrument", featureTypeName: "Notes",
      featureArgsList: ["None"], intervalSettings: {},
    },
    { rowType: "group", level: 1, name: "Scales" },
    {
      rowType: "interval", duration: "4:00",
      task: "Natural minor — all positions, ascending & descending",
      categoryName: "Instrument", featureTypeName: "Scale",
      featureArgsList: ["Minor", "A"], intervalSettings: {},
    },
    {
      rowType: "interval", duration: "4:00",
      task: "Minor pentatonic — all five positions",
      categoryName: "Instrument", featureTypeName: "Scale",
      featureArgsList: ["Minor Pentatonic", "A"], intervalSettings: {},
    },
    {
      rowType: "interval", duration: "3:00",
      task: "Minor blues — add the blue note to the pentatonic",
      categoryName: "Instrument", featureTypeName: "Scale",
      featureArgsList: ["Minor Blues", "A"], intervalSettings: {},
    },
    {
      rowType: "interval", duration: "3:00",
      task: "Harmonic minor — raised 7th gives the classical sound",
      categoryName: "Instrument", featureTypeName: "Scale",
      featureArgsList: ["Harmonic Minor", "A"], intervalSettings: {},
    },
    { rowType: "group", level: 1, name: "Triads" },
    {
      rowType: "interval", duration: "5:00",
      task: "Minor triad shapes — root, 1st and 2nd inversion",
      categoryName: "Instrument", featureTypeName: "Triad Shapes",
      featureArgsList: ["A", "Minor"], intervalSettings: {},
    },
    {
      rowType: "interval", duration: "5:00",
      task: "Relative major triads (C Major) — same notes, different root",
      categoryName: "Instrument", featureTypeName: "Triad Shapes",
      featureArgsList: ["C", "Major"], intervalSettings: {},
    },
    {
      rowType: "interval", duration: "4:00",
      task: "Diminished triads (B°) — the tension chord of A minor",
      categoryName: "Instrument", featureTypeName: "Triad Shapes",
      featureArgsList: ["B", "Diminished"], intervalSettings: {},
    },
  ],
}, null, 2);

/** Practice layout: schedule (play mode) drives an Any view that renders the
 *  current interval's feature. A metronome below the Any view is also linked
 *  to it so groove/tempo changes propagate to whatever feature is displayed. */
export const PRACTICE_LAYOUT: Readonly<CurrentPayload> = Object.freeze({
  referenceGrid: { cols: 160, rows: 77 },
  nextZIndex: 105,
  links: [
    { id: "link-1", sourceInstanceId: "fv-1", sourceHandle: "right" as const, targetInstanceId: "fv-2", targetHandle: "left" as const },
    { id: "link-2", sourceInstanceId: "fv-3", sourceHandle: "top" as const, targetInstanceId: "fv-2", targetHandle: "bottom" as const },
  ],
  openViews: {
    "fv-1": {
      instanceId: "fv-1",
      viewId: "schedule_floating_view",
      gridPosition: { col: 17, row: 1 },
      gridSize: { cols: 52, rows: 70 },
      zIndex: 100,
      viewState: { mode: "play", scheduleJSON: _MINOR_WORKOUT_SCHEDULE },
    },
    "fv-2": {
      instanceId: "fv-2",
      viewId: "any_floating_view",
      gridPosition: { col: 70, row: 1 },
      gridSize: { cols: 56, rows: 50 },
      zIndex: 101,
      viewState: {},
    },
    "fv-3": {
      instanceId: "fv-3",
      viewId: "instrument_floating_metronome",
      gridPosition: { col: 70, row: 55 },
      gridSize: { cols: 20, rows: 16 },
      zIndex: 102,
      viewState: {},
    },
  },
});

// ─── Registry ─────────────────────────────────────────────────────────────────

/** All built-in presets. Keys are accessed via the "default:" namespace in
 *  ScreenConfigManager, e.g. screenConfigManager.loadNamed("default:empty"). */
export const DEFAULT_CONFIGS: Readonly<Record<string, CurrentPayload>> = Object.freeze({
  empty: EMPTY_CONFIG,
  reference: REFERENCE_LAYOUT,
  backing: BACKING_LAYOUT,
  practice: PRACTICE_LAYOUT,
});

/** Ordered list of presets to show in UI pickers. "empty" is intentionally
 *  omitted — it is a programmatic fallback, not a user-facing choice. */
export const DEFAULT_CONFIG_OPTIONS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "reference", label: "Reference" },
  { key: "backing",   label: "Backing track" },
  { key: "practice",  label: "Practice" },
];
