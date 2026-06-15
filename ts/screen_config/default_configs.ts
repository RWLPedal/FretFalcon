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
import {
  BEGINNER_WORKOUT_SCHEDULE_JSON,
  ADVANCED_WORKOUT_SCHEDULE_JSON,
} from "../schedule/api";
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
        "fv-6": { col: 1, row: 27, colSpan: 57, rowSpan: 31, zIndex: 140 },
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
      // Tonic pedal matching the backing track's C-major key.
      viewState: { note: "C" },
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
        // Backing track — top-left (≈ its default/min 575×300)
        "fv-1": { col: 1, row: 0, colSpan: 38, rowSpan: 20, zIndex: 134 },
        // Timer — top of middle column
        "fv-4": { col: 46, row: 0, colSpan: 21, rowSpan: 8, zIndex: 120 },
        // Drone — below Timer
        "fv-6": { col: 46, row: 15, colSpan: 21, rowSpan: 8, zIndex: 122 },
        // MultiLayerFretboard — wide, spans the left two columns below the drum
        "fv-5": { col: 1, row: 27, colSpan: 66, rowSpan: 33, zIndex: 131 },
        // Chord (current) — right column, top
        "fv-7": { col: 70, row: 0, colSpan: 21, rowSpan: 24, zIndex: 136 },
        // Chord (next) — right column, below current
        "fv-8": { col: 70, row: 27, colSpan: 21, rowSpan: 27, zIndex: 135 },
      },
    },
  },
});

// ─── Practice layouts (schedule-driven) ──────────────────────────────────────

/** Builds a schedule-driven practice layout: a schedule panel (play mode) on the
 *  left drives an Any view that renders the current interval's feature; a metronome
 *  below the Any view is also linked. The two presets differ only by their schedule. */
function makePracticeLayout(
  scheduleJSON: string,
  metronomeBpm: number,
): Readonly<CurrentPayload> {
  return Object.freeze({
    instances: {
      "fv-1": {
        instanceId: "fv-1",
        viewId: "schedule_floating_view",
        viewState: { mode: "play", scheduleJSON },
      },
      "fv-2": {
        instanceId: "fv-2",
        viewId: "any_floating_view",
        viewState: {},
      },
      "fv-3": {
        instanceId: "fv-3",
        viewId: "instrument_floating_metronome",
        viewState: { bpm: metronomeBpm },
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
          // Schedule — left, full height (≥ its 38-col min width)
          "fv-1": { col: 1, row: 0, colSpan: 40, rowSpan: 57, zIndex: 100 },
          // Any view — fills the right region, flush to the right edge
          "fv-2": { col: 44, row: 0, colSpan: 52, rowSpan: 42, zIndex: 101 },
          // Metronome — right column, below the Any view
          "fv-3": { col: 44, row: 45, colSpan: 27, rowSpan: 12, zIndex: 102 },
        },
      },
    },
  });
}

/** Beginner practice: open ("cowboy") chords + the first pentatonic, schedule-driven. */
export const PRACTICE_BEGINNER_LAYOUT: Readonly<CurrentPayload> =
  makePracticeLayout(BEGINNER_WORKOUT_SCHEDULE_JSON, 50);

/** Advanced practice: 7th/9th chord transitions, triad voice leading, modal scales. */
export const PRACTICE_ADVANCED_LAYOUT: Readonly<CurrentPayload> =
  makePracticeLayout(ADVANCED_WORKOUT_SCHEDULE_JSON, 100);

/** Voice Leading layout: a backing track drives a Nearby Triads reference panel
 *  (smooth movement between chord shapes) and a multi-layer fretboard. A timer
 *  sits below the drum machine. */
export const VOICE_LEADING_LAYOUT: Readonly<CurrentPayload> = Object.freeze({
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
        "fv-6": { col: 1, row: 23, colSpan: 21, rowSpan: 8, zIndex: 137 },
        // MultiLayerFretboard — left column, below timer
        "fv-5": { col: 1, row: 34, colSpan: 57, rowSpan: 21, zIndex: 134 },
        // Nearby Triads — right, full-height
        "fv-2": { col: 60, row: 0, colSpan: 36, rowSpan: 57, zIndex: 138 },
      },
    },
  },
});

/** Harmony Explorer: an interactive theory lab with no backing track. The Circle
 *  of Fifths drives a Scale, a Chord diagram, and a Chord Progression — click a key
 *  on the circle and every panel follows. Demonstrates the link/drive system. */
export const HARMONY_EXPLORER_LAYOUT: Readonly<CurrentPayload> = Object.freeze({
  instances: {
    "fv-1": {
      instanceId: "fv-1",
      viewId: "circle_of_fifths",
      viewState: {},
    },
    "fv-2": {
      instanceId: "fv-2",
      viewId: "instrument_scale",
      viewState: { featureTypeName: "Scale", config: ["driven", "driven"] },
    },
    "fv-3": {
      instanceId: "fv-3",
      viewId: "instrument_chord",
      viewState: { featureTypeName: "Chord", config: ["driven", "driven"] },
    },
    "fv-4": {
      instanceId: "fv-4",
      viewId: "instrument_chord_progression",
      viewState: {
        featureTypeName: "Chord Progression",
        config: ["driven", "driven", "0", "3", "4"],
      },
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
      sourceInstanceId: "fv-1",
      sourceHandle: "right" as const,
      targetInstanceId: "fv-3",
      targetHandle: "left" as const,
    },
    {
      id: "link-3",
      sourceInstanceId: "fv-1",
      sourceHandle: "bottom" as const,
      targetInstanceId: "fv-4",
      targetHandle: "top" as const,
    },
  ],
  layout: {
    floating: {
      gridCols: GRID_COLS,
      rowPx: ROW_PX,
      nextZIndex: 105,
      perInstance: {
        // Circle of Fifths — top-left (driver)
        "fv-1": { col: 1, row: 1, colSpan: 32, rowSpan: 32, zIndex: 101 },
        // Chord Progression — below the circle (root + mode driven from the key)
        "fv-4": { col: 1, row: 34, colSpan: 32, rowSpan: 24, zIndex: 102 },
        // Scale — wide horizontal panel, top-right (driven)
        "fv-2": { col: 34, row: 1, colSpan: 62, rowSpan: 22, zIndex: 103 },
        // Chord — wide horizontal panel stacked below the scale (driven)
        "fv-3": { col: 34, row: 24, colSpan: 62, rowSpan: 34, zIndex: 104 },
      },
    },
  },
});

/** Strumming: a rhythm-practice layout. The Strum pattern builder drives a Drone so
 *  the pedal tone is plucked in time, a Chord Progression shows the chords to strum,
 *  and a Capo helps transpose the open-chord shapes. */
export const STRUMMING_LAYOUT: Readonly<CurrentPayload> = Object.freeze({
  instances: {
    "fv-1": {
      instanceId: "fv-1",
      viewId: "strum_view",
      viewState: {},
    },
    "fv-2": {
      instanceId: "fv-2",
      viewId: "drone_view",
      // Tonic pedal in G; the linked strum articulates it rhythmically.
      viewState: { note: "G" },
    },
    "fv-3": {
      instanceId: "fv-3",
      viewId: "instrument_chord_progression",
      viewState: {
        featureTypeName: "Chord Progression",
        config: ["G", "MAJOR", "0", "3", "4", "5"],
      },
    },
    "fv-4": {
      instanceId: "fv-4",
      viewId: "capo_view",
      viewState: {},
    },
  },
  links: [
    {
      id: "link-1",
      sourceInstanceId: "fv-1",
      sourceHandle: "bottom" as const,
      targetInstanceId: "fv-2",
      targetHandle: "top" as const,
    },
  ],
  layout: {
    floating: {
      gridCols: GRID_COLS,
      rowPx: ROW_PX,
      nextZIndex: 105,
      perInstance: {
        // Strum pattern — top-left (driver)
        "fv-1": { col: 1, row: 1, colSpan: 44, rowSpan: 14, zIndex: 104 },
        // Drone — below the strum (strum-articulated pedal tone)
        "fv-2": { col: 1, row: 16, colSpan: 28, rowSpan: 6, zIndex: 103 },
        // Capo — bottom-left
        "fv-4": { col: 1, row: 24, colSpan: 22, rowSpan: 30, zIndex: 102 },
        // Chord Progression — right column, the chords to strum
        "fv-3": { col: 46, row: 1, colSpan: 50, rowSpan: 57, zIndex: 101 },
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
    voice_leading: { default: VOICE_LEADING_LAYOUT },
    practice_beginner: { default: PRACTICE_BEGINNER_LAYOUT },
    practice_advanced: { default: PRACTICE_ADVANCED_LAYOUT },
    harmony_explorer: { default: HARMONY_EXPLORER_LAYOUT },
    strumming: { default: STRUMMING_LAYOUT },
  });

/** Ordered list of presets to show in UI pickers. "empty" is intentionally
 *  omitted — it is a programmatic fallback, not a user-facing choice. */
export const DEFAULT_CONFIG_OPTIONS: ReadonlyArray<{
  key: string;
  label: string;
}> = [
  { key: "reference", label: "Reference" },
  { key: "backing", label: "Backing track" },
  { key: "voice_leading", label: "Voice Leading" },
  { key: "practice_beginner", label: "Practice — Beginner" },
  { key: "practice_advanced", label: "Practice — Advanced" },
  { key: "harmony_explorer", label: "Harmony Explorer" },
  { key: "strumming", label: "Strumming" },
];
