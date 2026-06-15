// ts/screen_config/default_configs.ts
//
// Bundled starter layouts as TypeScript constants in V4 (col/row/span) format.
// These are always at the current payload shape, so they never need migration at runtime.
//
// Coordinate model:
//   col / row   — integer grid cell address. col 0 = CONTENT-area left (the sidebar's
//                 right edge), row 0 = content top. Columns span the content region,
//                 so a layout authored as col 0..32 fills the visible width at any size.
//   colSpan     — width in cells (GRID_COLS = 96 across the content region)
//   rowSpan     — height in cells. Cells are SQUARE (see grid_constants.ts): the same
//                 px edge is used for width and height, so panels keep their proportions.
//
// Author layouts within ~0..96 cols and ~0..60 rows (a typical screen shows ~54–60
// square rows). The persisted gridCols/rowPx fields are vestigial stamps.

import { CurrentPayload } from "./screen_config_types";
import { A_MINOR_WORKOUT_SCHEDULE_JSON } from "../schedule/api";
import { GRID_COLS, ROW_PX } from "../panels/grid_constants";

// ─── Built-in layouts ─────────────────────────────────────────────────────────

/** An empty canvas — no open views, no links. Used as the safe fallback when
 *  localStorage is empty or a migration fails unrecoverably. */
export const EMPTY_CONFIG: Readonly<CurrentPayload> = Object.freeze({
  instances: {},
  links: [],
  layout: {
    floating: {
      gridCols: GRID_COLS,
      rowPx: ROW_PX,
      nextZIndex: 100,
      perInstance: {},
    },
  },
});

/** General-purpose reference layout: Scale + Triad Shapes on the left,
 *  Chord and Chord Progression filling the right columns. */
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
  layout: {
    floating: {
      gridCols: GRID_COLS,
      rowPx: ROW_PX,
      nextZIndex: 144,
      perInstance: {
        // Scale fretboard — top-left
        "fv-8": { col: 1, row: 1, colSpan: 57, rowSpan: 24, zIndex: 141 },
        // Triad fretboard — below Scale
        "fv-6": { col: 1, row: 27, colSpan: 57, rowSpan: 30, zIndex: 140 },
        // Chord diagram — right column
        "fv-7": { col: 60, row: 1, colSpan: 15, rowSpan: 57, zIndex: 142 },
        // Chord Progression — far-right column
        "fv-9": { col: 78, row: 1, colSpan: 18, rowSpan: 57, zIndex: 143 },
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
      viewState: {
        featureTypeName: "Chord",
        config: ["driven_next", "driven_next"],
      },
    },
  },
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
  layout: {
    floating: {
      gridCols: GRID_COLS,
      rowPx: ROW_PX,
      nextZIndex: 136,
      perInstance: {
        // Drum machine — top-left (≈ its default/min 575×300)
        "fv-1": { col: 1, row: 0, colSpan: 32, rowSpan: 17, zIndex: 134 },
        // Timer — top of middle column
        "fv-4": { col: 51, row: 0, colSpan: 21, rowSpan: 12, zIndex: 120 },
        // Drone — below Timer
        "fv-6": { col: 51, row: 15, colSpan: 21, rowSpan: 9, zIndex: 122 },
        // MultiLayerFretboard — wide, spans the left two columns below the drum
        "fv-5": { col: 1, row: 27, colSpan: 66, rowSpan: 33, zIndex: 131 },
        // Chord (current) — right column, top
        "fv-7": { col: 75, row: 0, colSpan: 21, rowSpan: 24, zIndex: 136 },
        // Chord (next) — right column, below current
        "fv-8": { col: 75, row: 27, colSpan: 21, rowSpan: 27, zIndex: 135 },
      },
    },
  },
});

// ─── Practice layout schedule data ───────────────────────────────────────────

const _MINOR_WORKOUT_SCHEDULE = A_MINOR_WORKOUT_SCHEDULE_JSON;

/** Practice layout: schedule (play mode) drives an Any view that renders the
 *  current interval's feature. A metronome below the Any view is also linked. */
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
  layout: {
    floating: {
      gridCols: GRID_COLS,
      rowPx: ROW_PX,
      nextZIndex: 105,
      perInstance: {
        // Schedule — left, tall
        "fv-1": { col: 1, row: 0, colSpan: 36, rowSpan: 57, zIndex: 100 },
        // Any view — right column, top (col 50..96, flush to the right edge like the
        // other layouts; a wider span would overflow GRID_COLS and break tidy/border).
        "fv-2": { col: 50, row: 0, colSpan: 46, rowSpan: 39, zIndex: 101 },
        // Metronome — right column, below Any view
        "fv-3": { col: 50, row: 42, colSpan: 27, rowSpan: 15, zIndex: 102 },
      },
    },
  },
});

/** Triad practice layout: drum machine drives a Nearby Triads reference panel
 *  and a multi-layer fretboard. A timer sits below the drum machine. */
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
          [
            "kick",
            null,
            null,
            null,
            null,
            null,
            null,
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
            null,
            null,
            null,
            null,
            "shaker",
            null,
            null,
            null,
            null,
            null,
            "shaker",
            null,
            null,
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
          null,
          null,
        ],
        trackSounds: ["kick", "snare", "hihat", "crash"],
      },
    },
    "fv-2": {
      instanceId: "fv-2",
      viewId: "instrument_nearby_triads",
      viewState: {
        featureTypeName: "Nearby Triads",
        config: [
          "C",
          "MAJOR",
          "reference",
          "fret:5",
          "none",
          "0",
          "1",
          "4",
          "5",
        ],
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
  layout: {
    floating: {
      gridCols: GRID_COLS,
      rowPx: ROW_PX,
      nextZIndex: 140,
      perInstance: {
        // Drum machine — top-left (≈ its default/min 575×300)
        "fv-1": { col: 1, row: 0, colSpan: 32, rowSpan: 17, zIndex: 139 },
        // Timer — below drum machine (left column)
        "fv-6": { col: 1, row: 20, colSpan: 21, rowSpan: 12, zIndex: 137 },
        // MultiLayerFretboard — left column, below timer
        "fv-5": { col: 1, row: 35, colSpan: 57, rowSpan: 21, zIndex: 134 },
        // Nearby Triads — right, full-height
        "fv-2": { col: 60, row: 0, colSpan: 36, rowSpan: 57, zIndex: 138 },
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
