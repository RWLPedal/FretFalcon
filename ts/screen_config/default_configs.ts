// ts/screen_config/default_configs.ts
//
// Bundled starter layouts as TypeScript constants. These are always at the
// current payload shape, so they never need migration at runtime.
//
// To add a new starter layout:
//   1. Define a new Readonly<CurrentPayload> constant here.
//   2. Add it to DEFAULT_CONFIGS as { default: MY_LAYOUT } (optionally add compact: MY_LAYOUT_COMPACT).
//   3. It becomes accessible via ScreenConfigManager.loadNamed("default:<key>").
//      If a compact variant is provided it is used automatically on viewports narrower
//      than COMPACT_BREAKPOINT_COLS (≈1200px).

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
  referenceGrid: { cols: 113, rows: 64 },
  nextZIndex: 144,
  links: [
    {
      id: "link-1",
      sourceInstanceId: "fv-8",
      sourceHandle: "bottom" as const,
      targetInstanceId: "fv-6",
      targetHandle: "top" as const,
    },
    {
      id: "link-2",
      sourceInstanceId: "fv-8",
      sourceHandle: "right" as const,
      targetInstanceId: "fv-7",
      targetHandle: "left" as const,
    },
    {
      id: "link-3",
      sourceInstanceId: "fv-8",
      sourceHandle: "bottom" as const,
      targetInstanceId: "fv-9",
      targetHandle: "left" as const,
    },
  ],
  openViews: {
    "fv-6": {
      instanceId: "fv-6",
      viewId: "configurable_instrument_feature",
      gridPosition: { col: 17, row: 27 },
      gridSize: { cols: 48, rows: 30 },
      zIndex: 140,
      viewState: { featureTypeName: "Triad Shapes", config: ["G", "Major"] },
    },
    "fv-7": {
      instanceId: "fv-7",
      viewId: "configurable_instrument_feature",
      gridPosition: { col: 68, row: 1 },
      gridSize: { cols: 15, rows: 56 },
      zIndex: 142,
      viewState: {
        featureTypeName: "Chord",
        config: ["G", "Major"],
        isMoveable: true,
        configCollapsed: true,
      },
    },
    "fv-8": {
      instanceId: "fv-8",
      viewId: "configurable_instrument_feature",
      gridPosition: { col: 17, row: 1 },
      gridSize: { cols: 48, rows: 23 },
      zIndex: 141,
      viewState: { featureTypeName: "Scale", config: ["Major", "G"] },
    },
    "fv-9": {
      instanceId: "fv-9",
      viewId: "instrument_chord_progression",
      gridPosition: { col: 85, row: 1 },
      gridSize: { cols: 23, rows: 56 },
      zIndex: 143,
      viewState: {
        featureTypeName: "Chord Progression",
        config: ["G", "MAJOR", "0", "3", "4"],
      },
    },
  },
});

/** Backing track layout centred on an indie rock backing track. The drum machine
 *  loads with a pre-built 8-bar pattern (C Major, 118 BPM). A scale reference
 *  and timer fill the right column so you can stay focused while practising. */
export const BACKING_LAYOUT: Readonly<CurrentPayload> = Object.freeze({
  referenceGrid: { cols: 113, rows: 64 },
  nextZIndex: 136,
  links: [
    {
      id: "link-3",
      sourceInstanceId: "fv-1",
      sourceHandle: "bottom" as const,
      targetInstanceId: "fv-5",
      targetHandle: "top" as const,
    },
    {
      id: "link-4",
      sourceInstanceId: "fv-1",
      sourceHandle: "right" as const,
      targetInstanceId: "fv-7",
      targetHandle: "left" as const,
    },
    {
      id: "link-5",
      sourceInstanceId: "fv-1",
      sourceHandle: "right" as const,
      targetInstanceId: "fv-8",
      targetHandle: "left" as const,
    },
  ],
  openViews: {
    "fv-1": {
      instanceId: "fv-1",
      viewId: "drum_machine",
      gridPosition: { col: 17, row: 1 },
      gridSize: { cols: 36, rows: 21 },
      zIndex: 134,
      viewState: {
        bpm: 79,
        steps: 16,
        numMeasures: 8,
        progRootNote: "C",
        progMode: "MAJOR",
        measureChords: [1, 1, 5, 5, 6, 6, 4, 4],
        tracks: [
          [
            "kick",
            null,
            null,
            null,
            null,
            null,
            "kick",
            null,
            "kick",
            null,
            null,
            null,
            null,
            null,
            null,
            null,
          ],
          [
            null,
            null,
            null,
            null,
            "snare",
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            "snare",
            null,
            null,
            null,
          ],
          [
            "hihat",
            null,
            "hihat",
            null,
            "hihat",
            null,
            "hihat",
            null,
            "hihat",
            null,
            "hihat",
            null,
            "hihat",
            null,
            "hihat",
            null,
          ],
          [
            "crash",
            null,
            "shaker",
            null,
            "shaker",
            null,
            "shaker",
            null,
            "shaker",
            null,
            "shaker",
            null,
            "shaker",
            null,
            "shaker",
            null,
          ],
        ],
        bassTrack: [
          1,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          5,
          null,
          null,
          null,
          null,
          null,
          7,
          null,
        ],
        swingAmount: 0,
        trackSounds: ["kick", "snare", "hihat", "crash"],
      },
    },
    "fv-4": {
      instanceId: "fv-4",
      viewId: "floating_timer",
      gridPosition: { col: 66, row: 1 },
      gridSize: { cols: 16, rows: 9 },
      zIndex: 120,
      viewState: { duration: 300 },
    },
    "fv-5": {
      instanceId: "fv-5",
      viewId: "configurable_instrument_feature",
      gridPosition: { col: 17, row: 28 },
      gridSize: { cols: 60, rows: 33 },
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
      gridPosition: { col: 66, row: 11 },
      gridSize: { cols: 16, rows: 8 },
      zIndex: 122,
      viewState: { note: "A" },
    },
    "fv-7": {
      instanceId: "fv-7",
      viewId: "configurable_instrument_feature",
      gridPosition: { col: 83, row: 1 },
      gridSize: { cols: 24, rows: 29 },
      zIndex: 136,
      viewState: { featureTypeName: "Chord", config: ["driven", "driven"] },
    },
    "fv-8": {
      instanceId: "fv-8",
      viewId: "configurable_instrument_feature",
      gridPosition: { col: 83, row: 32 },
      gridSize: { cols: 24, rows: 29 },
      zIndex: 135,
      viewState: {
        featureTypeName: "Chord",
        config: ["driven_next", "driven_next"],
      },
    },
  },
});

// ─── Practice layout schedule data ───────────────────────────────────────────

// #floating-view-area covers the full page width; the sidebar occupies the
// first 192px (16 grid units at GRID_UNIT=12). All views start at col ≥ 17.
const _MINOR_WORKOUT_SCHEDULE = JSON.stringify(
  {
    name: "A Minor Workout",
    items: [
      { rowType: "group", level: 1, name: "Warmup", color: "--note-second" },
      {
        rowType: "interval",
        duration: "3:00",
        task: "Fretboard survey — no labels, find the notes by ear",
        categoryName: "Instrument",
        featureTypeName: "Notes",
        featureArgsList: ["None"],
        intervalSettings: {},
      },
      { rowType: "group", level: 1, name: "Scales", color: "--note-fifth" },
      {
        rowType: "interval",
        duration: "4:00",
        task: "Natural minor — all positions, ascending & descending",
        categoryName: "Instrument",
        featureTypeName: "Scale",
        featureArgsList: ["Minor", "A"],
        intervalSettings: {},
      },
      {
        rowType: "interval",
        duration: "4:00",
        task: "Minor pentatonic — all five positions",
        categoryName: "Instrument",
        featureTypeName: "Scale",
        featureArgsList: ["Minor Pentatonic", "A"],
        intervalSettings: {},
      },
      {
        rowType: "interval",
        duration: "3:00",
        task: "Minor blues — add the blue note to the pentatonic",
        categoryName: "Instrument",
        featureTypeName: "Scale",
        featureArgsList: ["Minor Blues", "A"],
        intervalSettings: {},
      },
      {
        rowType: "interval",
        duration: "3:00",
        task: "Harmonic minor — raised 7th gives the classical sound",
        categoryName: "Instrument",
        featureTypeName: "Scale",
        featureArgsList: ["Harmonic Minor", "A"],
        intervalSettings: {},
      },
      { rowType: "group", level: 1, name: "Triads", color: "--note-seventh" },
      {
        rowType: "interval",
        duration: "5:00",
        task: "Minor triad shapes — root, 1st and 2nd inversion",
        categoryName: "Instrument",
        featureTypeName: "Triad Shapes",
        featureArgsList: ["A", "Minor"],
        intervalSettings: {},
      },
      {
        rowType: "interval",
        duration: "5:00",
        task: "Relative major triads (C Major) — same notes, different root",
        categoryName: "Instrument",
        featureTypeName: "Triad Shapes",
        featureArgsList: ["C", "Major"],
        intervalSettings: {},
      },
      {
        rowType: "interval",
        duration: "4:00",
        task: "Diminished triads (B°) — the tension chord of A minor",
        categoryName: "Instrument",
        featureTypeName: "Triad Shapes",
        featureArgsList: ["B", "Diminished"],
        intervalSettings: {},
      },
    ],
  },
  null,
  2,
);

/** Practice layout: schedule (play mode) drives an Any view that renders the
 *  current interval's feature. A metronome below the Any view is also linked
 *  to it so groove/tempo changes propagate to whatever feature is displayed. */
export const PRACTICE_LAYOUT: Readonly<CurrentPayload> = Object.freeze({
  referenceGrid: { cols: 113, rows: 64 },
  nextZIndex: 105,
  links: [
    {
      id: "link-1",
      sourceInstanceId: "fv-1",
      sourceHandle: "right" as const,
      targetInstanceId: "fv-2",
      targetHandle: "left" as const,
    },
    {
      id: "link-2",
      sourceInstanceId: "fv-3",
      sourceHandle: "top" as const,
      targetInstanceId: "fv-2",
      targetHandle: "bottom" as const,
    },
  ],
  openViews: {
    "fv-1": {
      instanceId: "fv-1",
      viewId: "schedule_floating_view",
      gridPosition: { col: 17, row: 1 },
      gridSize: { cols: 35, rows: 58 },
      zIndex: 100,
      viewState: { mode: "play", scheduleJSON: _MINOR_WORKOUT_SCHEDULE },
    },
    "fv-2": {
      instanceId: "fv-2",
      viewId: "any_floating_view",
      gridPosition: { col: 62, row: 1 },
      gridSize: { cols: 38, rows: 42 },
      zIndex: 101,
      viewState: {},
    },
    "fv-3": {
      instanceId: "fv-3",
      viewId: "instrument_floating_metronome",
      gridPosition: { col: 62, row: 46 },
      gridSize: { cols: 20, rows: 13 },
      zIndex: 102,
      viewState: {},
    },
  },
});

/** Triad practice layout: drum machine drives a Nearby Triads reference panel
 *  and a multi-layer fretboard. A timer sits in the top-right column. */
export const TRIAD_PRACTICE_LAYOUT: Readonly<CurrentPayload> = Object.freeze({
  referenceGrid: { cols: 113, rows: 64 },
  nextZIndex: 140,
  links: [
    {
      id: "link-2",
      sourceInstanceId: "fv-1",
      sourceHandle: "bottom" as const,
      targetInstanceId: "fv-5",
      targetHandle: "top" as const,
    },
    {
      id: "link-3",
      sourceInstanceId: "fv-1",
      sourceHandle: "right" as const,
      targetInstanceId: "fv-2",
      targetHandle: "left" as const,
    },
  ],
  openViews: {
    "fv-1": {
      instanceId: "fv-1",
      viewId: "drum_machine",
      gridPosition: { col: 17, row: 1 },
      gridSize: { cols: 33, rows: 22 },
      zIndex: 139,
      viewState: {
        bpm: 63,
        steps: 16,
        swingAmount: 0,
        numMeasures: 8,
        progRootNote: "C",
        progMode: "MAJOR",
        measureChords: [1, 1, 5, 5, 6, 6, 4, 4],
        tracks: [
          [
            "kick",
            null,
            null,
            null,
            null,
            null,
            "kick",
            null,
            "kick",
            null,
            null,
            null,
            null,
            null,
            null,
            null,
          ],
          [
            null,
            null,
            null,
            null,
            "snare",
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            "snare",
            null,
            null,
            null,
          ],
          [
            "hihat",
            null,
            "hihat",
            null,
            "hihat",
            null,
            "hihat",
            null,
            "hihat",
            null,
            "hihat",
            null,
            "hihat",
            null,
            "hihat",
            null,
          ],
          [
            "crash",
            null,
            "shaker",
            null,
            "shaker",
            null,
            "shaker",
            null,
            "shaker",
            null,
            "shaker",
            null,
            "shaker",
            null,
            "shaker",
            null,
          ],
        ],
        bassTrack: [
          1,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          5,
          null,
          null,
          null,
          null,
          null,
          7,
          null,
        ],
        trackSounds: ["kick", "snare", "hihat", "crash"],
      },
    },
    "fv-2": {
      instanceId: "fv-2",
      viewId: "configurable_instrument_feature",
      gridPosition: { col: 75, row: 1 },
      gridSize: { cols: 28, rows: 62 },
      zIndex: 138,
      viewState: {
        featureTypeName: "Nearby Triads",
        config: ["C", "MAJOR", "reference", "0", "4", "5", "3"],
      },
    },
    "fv-5": {
      instanceId: "fv-5",
      viewId: "configurable_instrument_feature",
      gridPosition: { col: 17, row: 37 },
      gridSize: { cols: 50, rows: 26 },
      zIndex: 134,
      viewState: {
        featureTypeName: "MultiLayerFretboard",
        config: [
          "chord|driven|var(--dm-palette-2)|none",
          "scale|driven|driven|var(--dm-palette-3)|none",
        ],
      },
    },
    "fv-6": {
      instanceId: "fv-6",
      viewId: "floating_timer",
      gridPosition: { col: 17, row: 27 },
      gridSize: { cols: 17, rows: 7 },
      zIndex: 137,
      viewState: { duration: 300 },
    },
  },
});
// ─── Compact variants ─────────────────────────────────────────────────────────
// Used automatically when the viewport is below COMPACT_BREAKPOINT_COLS (~1200px).
// Each keeps only the essential panels so nothing overlaps on smaller screens.

/** Compact backing layout: drum machine + fretboard only. Drops timer, drone,
 *  and the two chord side-panels to avoid cramping on smaller screens. */
export const BACKING_LAYOUT_COMPACT: Readonly<CurrentPayload> = Object.freeze({
  referenceGrid: { cols: 85, rows: 55 },
  nextZIndex: 122,
  links: [
    {
      id: "link-3",
      sourceInstanceId: "fv-1",
      sourceHandle: "bottom" as const,
      targetInstanceId: "fv-5",
      targetHandle: "top" as const,
    },
  ],
  openViews: {
    "fv-1": {
      instanceId: "fv-1",
      viewId: "drum_machine",
      gridPosition: { col: 17, row: 1 },
      gridSize: { cols: 62, rows: 26 },
      zIndex: 121,
      viewState: {
        bpm: 79,
        steps: 16,
        numMeasures: 8,
        progRootNote: "C",
        progMode: "MAJOR",
        measureChords: [1, 1, 5, 5, 6, 6, 4, 4],
        tracks: [
          [
            "kick",
            null,
            null,
            null,
            null,
            null,
            "kick",
            null,
            "kick",
            null,
            null,
            null,
            null,
            null,
            null,
            null,
          ],
          [
            null,
            null,
            null,
            null,
            "snare",
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            "snare",
            null,
            null,
            null,
          ],
          [
            "hihat",
            null,
            "hihat",
            null,
            "hihat",
            null,
            "hihat",
            null,
            "hihat",
            null,
            "hihat",
            null,
            "hihat",
            null,
            "hihat",
            null,
          ],
          [
            "crash",
            null,
            "shaker",
            null,
            "shaker",
            null,
            "shaker",
            null,
            "shaker",
            null,
            "shaker",
            null,
            "shaker",
            null,
            "shaker",
            null,
          ],
        ],
        bassTrack: [
          1,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          5,
          null,
          null,
          null,
          null,
          null,
          7,
          null,
        ],
        swingAmount: 0,
        trackSounds: ["kick", "snare", "hihat", "crash"],
      },
    },
    "fv-5": {
      instanceId: "fv-5",
      viewId: "configurable_instrument_feature",
      gridPosition: { col: 17, row: 30 },
      gridSize: { cols: 62, rows: 22 },
      zIndex: 120,
      viewState: {
        featureTypeName: "MultiLayerFretboard",
        config: [
          "chord|driven|var(--dm-palette-2)|none",
          "chord|driven_next|none|var(--dm-palette-4)",
          "scale|driven|driven|var(--dm-palette-3)|none",
        ],
      },
    },
  },
});

/** Compact triad practice layout: drum machine + Nearby Triads only. Drops the
 *  multi-layer fretboard and timer to keep both panels comfortably visible. */
export const TRIAD_PRACTICE_LAYOUT_COMPACT: Readonly<CurrentPayload> =
  Object.freeze({
    referenceGrid: { cols: 85, rows: 55 },
    nextZIndex: 122,
    links: [
      {
        id: "link-3",
        sourceInstanceId: "fv-1",
        sourceHandle: "right" as const,
        targetInstanceId: "fv-2",
        targetHandle: "left" as const,
      },
    ],
    openViews: {
      "fv-1": {
        instanceId: "fv-1",
        viewId: "drum_machine",
        gridPosition: { col: 17, row: 1 },
        gridSize: { cols: 42, rows: 26 },
        zIndex: 121,
        viewState: {
          bpm: 63,
          steps: 16,
          swingAmount: 0,
          numMeasures: 8,
          progRootNote: "C",
          progMode: "MAJOR",
          measureChords: [1, 1, 5, 5, 6, 6, 4, 4],
          tracks: [
            [
              "kick",
              null,
              null,
              null,
              null,
              null,
              "kick",
              null,
              "kick",
              null,
              null,
              null,
              null,
              null,
              null,
              null,
            ],
            [
              null,
              null,
              null,
              null,
              "snare",
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              "snare",
              null,
              null,
              null,
            ],
            [
              "hihat",
              null,
              "hihat",
              null,
              "hihat",
              null,
              "hihat",
              null,
              "hihat",
              null,
              "hihat",
              null,
              "hihat",
              null,
              "hihat",
              null,
            ],
            [
              "crash",
              null,
              "shaker",
              null,
              "shaker",
              null,
              "shaker",
              null,
              "shaker",
              null,
              "shaker",
              null,
              "shaker",
              null,
              "shaker",
              null,
            ],
          ],
          bassTrack: [
            1,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            5,
            null,
            null,
            null,
            null,
            null,
            7,
            null,
          ],
          trackSounds: ["kick", "snare", "hihat", "crash"],
        },
      },
      "fv-2": {
        instanceId: "fv-2",
        viewId: "configurable_instrument_feature",
        gridPosition: { col: 60, row: 1 },
        gridSize: { cols: 24, rows: 52 },
        zIndex: 120,
        viewState: {
          featureTypeName: "Nearby Triads",
          config: ["C", "MAJOR", "reference", "0", "4", "5", "3"],
        },
      },
    },
  });

// ─── Registry ─────────────────────────────────────────────────────────────────

/** Grid-column threshold below which the compact variant of a layout is
 *  selected. 100 cols ≈ 1200px — comfortably between the 768px mobile
 *  breakpoint (64 cols) and the 1366px design target (113 cols). */
export const COMPACT_BREAKPOINT_COLS = 115;

/** Each entry bundles the full layout with an optional compact variant.
 *  The compact variant is used when the viewport is below COMPACT_BREAKPOINT_COLS. */
export interface DefaultConfigEntry {
  default: CurrentPayload;
  compact?: CurrentPayload;
}

/** All built-in presets. Keys are accessed via the "default:" namespace in
 *  ScreenConfigManager, e.g. screenConfigManager.loadNamed("default:empty"). */
export const DEFAULT_CONFIGS: Readonly<Record<string, DefaultConfigEntry>> =
  Object.freeze({
    empty: { default: EMPTY_CONFIG },
    reference: { default: REFERENCE_LAYOUT },
    backing: { default: BACKING_LAYOUT, compact: BACKING_LAYOUT_COMPACT },
    practice: { default: PRACTICE_LAYOUT },
    triad_practice: {
      default: TRIAD_PRACTICE_LAYOUT,
      compact: TRIAD_PRACTICE_LAYOUT_COMPACT,
    },
  });

/** Ordered list of presets to show in UI pickers. "empty" is intentionally
 *  omitted — it is a programmatic fallback, not a user-facing choice. */
export const DEFAULT_CONFIG_OPTIONS: ReadonlyArray<{
  key: string;
  label: string;
}> = [
  { key: "reference", label: "Reference" },
  { key: "backing", label: "Backing track" },
  { key: "practice", label: "Practice" },
  { key: "triad_practice", label: "Triad Practice" },
];
