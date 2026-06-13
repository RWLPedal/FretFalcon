// ts/screen_config/default_configs.ts
//
// Bundled starter layouts as TypeScript constants. These are always at the
// current V3 payload shape, so they never need migration at runtime.
//
// To add a new starter layout:
//   1. Define a new Readonly<CurrentPayload> constant here.
//   2. Add it to DEFAULT_CONFIGS as { default: MY_LAYOUT }.
//   3. It becomes accessible via ScreenConfigManager.loadNamed("default:<key>").

import { CurrentPayload } from "./screen_config_types";
import { A_MINOR_WORKOUT_SCHEDULE_JSON } from "../schedule/api";

// ─── Built-in layouts ─────────────────────────────────────────────────────────

/** An empty canvas — no open views, no links. Used as the safe fallback when
 *  localStorage is empty or a migration fails unrecoverably. */
export const EMPTY_CONFIG: Readonly<CurrentPayload> = Object.freeze({
  instances: {},
  links: [],
  layout: {
    floating: { referenceGrid: { cols: 80, rows: 60 }, nextZIndex: 100, perInstance: {} },
  },
});

/** General-purpose reference layout: Scale + Triad Shapes across the top,
 *  Chord and Chord Progression filling the right column. */
export const REFERENCE_LAYOUT: Readonly<CurrentPayload> = Object.freeze({
  instances: {
    "fv-6": {
      instanceId: "fv-6",
      viewId: "instrument_triad",
      viewState: { featureTypeName: "Triad Shapes", config: ["G", "Major"] },
    },
    "fv-7": {
      instanceId: "fv-7",
      viewId: "instrument_chord",
      viewState: {
        featureTypeName: "Chord",
        config: ["G", "Major"],
        isMoveable: true,
        configCollapsed: true,
      },
    },
    "fv-8": {
      instanceId: "fv-8",
      viewId: "instrument_scale",
      viewState: { featureTypeName: "Scale", config: ["Major", "G"] },
    },
    "fv-9": {
      instanceId: "fv-9",
      viewId: "instrument_chord_progression",
      viewState: {
        featureTypeName: "Chord Progression",
        config: ["G", "MAJOR", "0", "3", "4"],
      },
    },
  },
  links: [
    { id: "link-1", sourceInstanceId: "fv-8", sourceHandle: "bottom" as const, targetInstanceId: "fv-6", targetHandle: "top" as const },
    { id: "link-2", sourceInstanceId: "fv-8", sourceHandle: "right" as const, targetInstanceId: "fv-7", targetHandle: "left" as const },
    { id: "link-3", sourceInstanceId: "fv-8", sourceHandle: "bottom" as const, targetInstanceId: "fv-9", targetHandle: "left" as const },
  ],
  layout: {
    floating: {
      referenceGrid: { cols: 113, rows: 64 },
      nextZIndex: 144,
      perInstance: {
        "fv-6": { gridPosition: { col: 17, row: 27 }, gridSize: { cols: 48, rows: 30 }, zIndex: 140 },
        "fv-7": { gridPosition: { col: 68, row: 1 }, gridSize: { cols: 15, rows: 56 }, zIndex: 142 },
        "fv-8": { gridPosition: { col: 17, row: 1 }, gridSize: { cols: 48, rows: 23 }, zIndex: 141 },
        "fv-9": { gridPosition: { col: 85, row: 1 }, gridSize: { cols: 23, rows: 56 }, zIndex: 143 },
      },
    },
  },
});

/** Backing track layout centred on an indie rock backing track. The drum machine
 *  loads with a pre-built 8-bar pattern (C Major, 79 BPM). A scale reference
 *  and timer fill the right column so you can stay focused while practising. */
export const BACKING_LAYOUT: Readonly<CurrentPayload> = Object.freeze({
  instances: {
    "fv-1": {
      instanceId: "fv-1",
      viewId: "drum_machine",
      viewState: {
        bpm: 79,
        steps: 16,
        numMeasures: 8,
        progRootNote: "C",
        progMode: "MAJOR",
        measureChords: [1, 1, 5, 5, 6, 6, 4, 4],
        tracks: [
          ["kick", null, null, null, null, null, "kick", null, "kick", null, null, null, null, null, null, null],
          [null, null, null, null, "snare", null, null, null, null, null, null, null, "snare", null, null, null],
          ["hihat", null, "hihat", null, "hihat", null, "hihat", null, "hihat", null, "hihat", null, "hihat", null, "hihat", null],
          ["crash", null, "shaker", null, "shaker", null, "shaker", null, "shaker", null, "shaker", null, "shaker", null, "shaker", null],
        ],
        bassTrack: [1, null, null, null, null, null, null, null, 5, null, null, null, null, null, 7, null],
        swingAmount: 0,
        trackSounds: ["kick", "snare", "hihat", "crash"],
      },
    },
    "fv-4": {
      instanceId: "fv-4",
      viewId: "floating_timer",
      viewState: { duration: 300 },
    },
    "fv-5": {
      instanceId: "fv-5",
      viewId: "instrument_multifret",
      viewState: {
        featureTypeName: "MultiLayerFretboard",
        config: [
          "true",
          "chord|driven_next|var(--dm-palette-1)|none",
          "chord|driven|var(--dm-palette-2)|none",
          "scale|driven|driven|var(--dm-palette-3)|none",
        ],
      },
    },
    "fv-6": {
      instanceId: "fv-6",
      viewId: "drone_view",
      viewState: { note: "A" },
    },
    "fv-7": {
      instanceId: "fv-7",
      viewId: "instrument_chord",
      viewState: { featureTypeName: "Chord", config: ["driven", "driven"] },
    },
    "fv-8": {
      instanceId: "fv-8",
      viewId: "instrument_chord",
      viewState: { featureTypeName: "Chord", config: ["driven_next", "driven_next"] },
    },
  },
  links: [
    { id: "link-3", sourceInstanceId: "fv-1", sourceHandle: "bottom" as const, targetInstanceId: "fv-5", targetHandle: "top" as const },
    { id: "link-4", sourceInstanceId: "fv-1", sourceHandle: "right" as const, targetInstanceId: "fv-7", targetHandle: "left" as const },
    { id: "link-5", sourceInstanceId: "fv-1", sourceHandle: "right" as const, targetInstanceId: "fv-8", targetHandle: "left" as const },
  ],
  layout: {
    floating: {
      referenceGrid: { cols: 113, rows: 64 },
      nextZIndex: 136,
      perInstance: {
        "fv-1": { gridPosition: { col: 17, row: 1 }, gridSize: { cols: 36, rows: 21 }, zIndex: 134 },
        "fv-4": { gridPosition: { col: 66, row: 1 }, gridSize: { cols: 16, rows: 9 }, zIndex: 120 },
        "fv-5": { gridPosition: { col: 17, row: 28 }, gridSize: { cols: 60, rows: 33 }, zIndex: 131 },
        "fv-6": { gridPosition: { col: 66, row: 11 }, gridSize: { cols: 16, rows: 8 }, zIndex: 122 },
        "fv-7": { gridPosition: { col: 83, row: 1 }, gridSize: { cols: 24, rows: 29 }, zIndex: 136 },
        "fv-8": { gridPosition: { col: 83, row: 32 }, gridSize: { cols: 24, rows: 29 }, zIndex: 135 },
      },
    },
  },
});

// ─── Practice layout schedule data ───────────────────────────────────────────

// The JSON lives in ts/schedule/presets/a_minor_workout.ts and is accessed via
// the schedule public API so that screen_config does not import schedule internals.
const _MINOR_WORKOUT_SCHEDULE = A_MINOR_WORKOUT_SCHEDULE_JSON;

/** Practice layout: schedule (play mode) drives an Any view that renders the
 *  current interval's feature. A metronome below the Any view is also linked
 *  to it so groove/tempo changes propagate to whatever feature is displayed. */
export const PRACTICE_LAYOUT: Readonly<CurrentPayload> = Object.freeze({
  instances: {
    "fv-1": {
      instanceId: "fv-1",
      viewId: "schedule_floating_view",
      viewState: { mode: "play", scheduleJSON: _MINOR_WORKOUT_SCHEDULE },
    },
    "fv-2": {
      instanceId: "fv-2",
      viewId: "any_floating_view",
      viewState: {},
    },
    "fv-3": {
      instanceId: "fv-3",
      viewId: "instrument_floating_metronome",
      viewState: {},
    },
  },
  links: [
    { id: "link-1", sourceInstanceId: "fv-1", sourceHandle: "right" as const, targetInstanceId: "fv-2", targetHandle: "left" as const },
    { id: "link-2", sourceInstanceId: "fv-3", sourceHandle: "top" as const, targetInstanceId: "fv-2", targetHandle: "bottom" as const },
  ],
  layout: {
    floating: {
      referenceGrid: { cols: 113, rows: 64 },
      nextZIndex: 105,
      perInstance: {
        "fv-1": { gridPosition: { col: 17, row: 1 }, gridSize: { cols: 35, rows: 58 }, zIndex: 100 },
        "fv-2": { gridPosition: { col: 62, row: 1 }, gridSize: { cols: 38, rows: 42 }, zIndex: 101 },
        "fv-3": { gridPosition: { col: 62, row: 46 }, gridSize: { cols: 20, rows: 13 }, zIndex: 102 },
      },
    },
  },
});

/** Triad practice layout: drum machine drives a Nearby Triads reference panel
 *  and a multi-layer fretboard. A timer sits in the top-right column. */
export const TRIAD_PRACTICE_LAYOUT: Readonly<CurrentPayload> = Object.freeze({
  instances: {
    "fv-1": {
      instanceId: "fv-1",
      viewId: "drum_machine",
      viewState: {
        bpm: 108,
        steps: 16,
        swingAmount: 0,
        numMeasures: 8,
        progRootNote: "C",
        progMode: "MAJOR",
        measureChords: [1, 1, 2, 2, 5, 5, 6, 6],
        tracks: [
          ["kick", null, null, null, null, null, null, null, "kick", null, null, null, null, null, null, null],
          [null, null, null, null, "snare", null, null, null, null, null, null, null, "snare", null, null, null],
          ["hihat", null, "hihat", null, "hihat", null, "hihat", null, "hihat", null, "hihat", null, "hihat", null, "hihat", null],
          ["crash", null, null, null, null, null, "shaker", null, null, null, null, null, "shaker", null, null, null],
        ],
        bassTrack: [1, null, null, null, null, null, null, null, 5, null, null, null, null, null, null, null],
        trackSounds: ["kick", "snare", "hihat", "crash"],
      },
    },
    "fv-2": {
      instanceId: "fv-2",
      viewId: "instrument_nearby_triads",
      viewState: {
        featureTypeName: "Nearby Triads",
        config: ["C", "MAJOR", "reference", "fret:5", "none", "0", "1", "4", "5"],
      },
    },
    "fv-5": {
      instanceId: "fv-5",
      viewId: "instrument_multifret",
      viewState: {
        featureTypeName: "MultiLayerFretboard",
        config: [
          "true",
          "chord|driven_next|var(--dm-palette-1)|none",
          "chord|driven|var(--dm-palette-2)|none",
          "scale|driven|driven|var(--dm-palette-3)|none",
        ],
      },
    },
    "fv-6": {
      instanceId: "fv-6",
      viewId: "floating_timer",
      viewState: { duration: 300 },
    },
  },
  links: [
    { id: "link-2", sourceInstanceId: "fv-1", sourceHandle: "bottom" as const, targetInstanceId: "fv-5", targetHandle: "top" as const },
    { id: "link-3", sourceInstanceId: "fv-1", sourceHandle: "right" as const, targetInstanceId: "fv-2", targetHandle: "left" as const },
  ],
  layout: {
    floating: {
      referenceGrid: { cols: 113, rows: 64 },
      nextZIndex: 140,
      perInstance: {
        "fv-1": { gridPosition: { col: 17, row: 1 }, gridSize: { cols: 33, rows: 22 }, zIndex: 139 },
        "fv-2": { gridPosition: { col: 75, row: 1 }, gridSize: { cols: 28, rows: 62 }, zIndex: 138 },
        "fv-5": { gridPosition: { col: 17, row: 37 }, gridSize: { cols: 50, rows: 26 }, zIndex: 134 },
        "fv-6": { gridPosition: { col: 17, row: 27 }, gridSize: { cols: 17, rows: 7 }, zIndex: 137 },
      },
    },
  },
});

// ─── Registry ─────────────────────────────────────────────────────────────────

export interface DefaultConfigEntry {
  default: CurrentPayload;
}

/** All built-in presets. Keys are accessed via the "default:" namespace in
 *  ScreenConfigManager, e.g. screenConfigManager.loadNamed("default:empty"). */
export const DEFAULT_CONFIGS: Readonly<Record<string, DefaultConfigEntry>> =
  Object.freeze({
    empty: { default: EMPTY_CONFIG },
    reference: { default: REFERENCE_LAYOUT },
    backing: { default: BACKING_LAYOUT },
    practice: { default: PRACTICE_LAYOUT },
    triad_practice: { default: TRIAD_PRACTICE_LAYOUT },
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
