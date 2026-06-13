import { DiatonicMode } from '../../music/music_types';
import { ToneVoice } from '../../sounds/tone_voices';
import { DrumSoundId } from '../../sounds/drum_sounds';

export type TrackData = (DrumSoundId | null)[];
export type BassStep = number | null; // 1–7 scale degree, null = rest

export interface DrumPreset {
  name: string;
  bpm: number;
  steps: number;
  tracks: TrackData[];
  bassTrack: BassStep[];
  numMeasures?: 4 | 8 | 12;
  measureChords?: (number | null)[];
  progMode?: DiatonicMode;
  swingAmount?: number; // 0.0–0.5; undefined = leave slider untouched
  toneVoice?: ToneVoice;
}

export const BASS_DEGREE_COLORS: Record<number, string> = {
  1: "var(--dm-palette-1)",
  2: "var(--dm-palette-2)",
  3: "var(--dm-palette-3)",
  4: "var(--dm-palette-4)",
  5: "var(--dm-palette-5)",
  6: "var(--dm-palette-6)",
  7: "var(--dm-palette-7)",
};

export const NUM_TRACKS = 4;
export const DEFAULT_TRACK_SOUNDS: DrumSoundId[] = ["kick", "snare", "hihat", "crash"];

export const SOUND_COLORS: Record<DrumSoundId, string> = {
  kick: "var(--dm-palette-1)",
  snare: "var(--dm-palette-2)",
  hihat: "var(--dm-palette-3)",
  open_hihat: "var(--dm-palette-4)",
  crash: "var(--dm-palette-5)",
  tom: "var(--dm-palette-6)",
  shaker: "var(--dm-palette-7)",
};

export function emptyTracks(steps: number): TrackData[] {
  return Array.from({ length: NUM_TRACKS }, () => new Array(steps).fill(null));
}
export function emptyBass(steps: number): BassStep[] {
  return new Array(steps).fill(null);
}

// measureChords values are scale degree numbers (1=tonic, 4=subdominant, 5=dominant…)
// Presets assume Ionian (Major) by default; mode changes re-express the same degrees.
export const PRESETS: DrumPreset[] = [
  {
    name: "Empty",
    bpm: 120,
    steps: 16,
    numMeasures: 4,
    toneVoice: "clean",
    tracks: emptyTracks(16),
    bassTrack: emptyBass(16),
    measureChords: [null, null, null, null],
  },
  {
    // Afrobeat: syncopated kick, interlocking 16th hihats, Dorian tonality
    name: "Afrobeat",
    bpm: 105,
    steps: 16,
    numMeasures: 8,
    swingAmount: 0.12,
    toneVoice: "rhodes",
    progMode: DiatonicMode.Dorian,
    tracks: [
      ["kick", null, null, "kick", null, null, "kick", null, null, "kick", null, null, "kick", null, null, null],
      [null, null, null, null, "snare", null, null, "snare", null, null, null, null, "snare", null, null, null],
      ["hihat", "hihat", "hihat", "hihat", "hihat", "hihat", "hihat", "hihat", "hihat", "hihat", "hihat", "hihat", "hihat", "hihat", "hihat", "hihat"],
      [null, null, null, null, null, null, null, null, null, null, "open_hihat", null, null, null, "open_hihat", null],
    ],
    bassTrack: [1, null, null, null, null, null, 3, null, 5, null, null, null, null, null, null, null],
    measureChords: [1, 4, 1, 5, 1, 4, 2, 5],
  },
  {
    // Ambient: sparse crash/open-hihat pulse with gentle shaker breath, slow Aeolian i–bVI–bVII progression
    name: "Ambient",
    bpm: 62,
    steps: 16,
    numMeasures: 8,
    toneVoice: "warm",
    progMode: DiatonicMode.Aeolian,
    tracks: [
      ["crash", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, "open_hihat", null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
      [null, "shaker", null, "shaker", null, "shaker", null, "shaker", null, "shaker", null, "shaker", null, "shaker", null, "shaker"],
    ],
    bassTrack: [1, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    measureChords: [1, 1, 6, 6, 7, 7, 1, 1],
  },
  {
    name: "Blues Shuffle",
    bpm: 90,
    steps: 16,
    numMeasures: 12,
    swingAmount: 0.3,
    toneVoice: "overdrive",
    tracks: [
      ["kick", null, null, null, null, null, null, null, "tom", null, null, null, null, null, null, null],
      [null, null, null, null, "snare", null, null, null, null, null, null, null, "snare", null, null, null],
      ["hihat", null, "hihat", null, "hihat", null, "hihat", null, "hihat", null, "hihat", null, "hihat", null, "hihat", null],
      [null, null, null, null, null, null, null, null, null, null, null, null, null, null, "open_hihat", null],
    ],
    bassTrack: [1, null, null, null, 3, null, null, null, 5, null, null, null, 7, null, null, null],
    measureChords: [1, 1, 1, 1, 4, 4, 1, 1, 5, 4, 1, 5],
  },
  {
    // Bluegrass: fast boom-chick with rolling 8th hihats and dotted shaker pulse, I–IV–V–I
    name: "Bluegrass",
    bpm: 165,
    steps: 16,
    numMeasures: 4,
    swingAmount: 0.1,
    toneVoice: "warm",
    tracks: [
      ["kick", null, null, null, null, null, null, null, "kick", null, null, null, null, null, null, null],
      [null, null, null, null, "snare", null, null, null, null, null, null, null, "snare", null, "snare", null],
      ["hihat", null, "hihat", null, "hihat", null, "hihat", null, "hihat", null, "hihat", null, "hihat", null, "hihat", null],
      ["shaker", null, null, "shaker", null, null, "shaker", null, null, "shaker", null, null, "shaker", null, null, null],
    ],
    bassTrack: [1, null, null, null, 4, null, null, null, 5, null, null, null, 1, null, null, null],
    measureChords: [1, 4, 5, 1],
  },
  {
    // Desert/stoner rock: slow heavy kick with syncopated doublet, open hihats on offbeats, Dorian i–bVII–IV
    name: "Desert Rock",
    bpm: 72,
    steps: 16,
    numMeasures: 4,
    toneVoice: "fuzz",
    progMode: DiatonicMode.Dorian,
    swingAmount: 0,
    tracks: [
      ["kick", null, null, null, null, null, null, null, "kick", null, "kick", null, null, null, "kick", null],
      [null, null, null, null, "snare", null, null, null, null, null, null, null, "snare", null, null, null],
      [null, null, "open_hihat", null, null, null, "open_hihat", null, null, null, "open_hihat", null, null, null, "open_hihat", null],
      ["crash", null, null, null, null, null, null, null, null, null, null, null, null, null, null, "tom"],
    ],
    bassTrack: [1, null, null, null, null, null, 5, null, 1, null, null, null, 5, null, null, null],
    measureChords: [1, 7, 4, 1],
  },
  {
    // Dream Pop: sparse kick, steady hihats, Lydian I–II shimmer
    name: "Dream Pop",
    bpm: 95,
    steps: 16,
    numMeasures: 8,
    toneVoice: "warm",
    progMode: DiatonicMode.Lydian,
    tracks: [
      [null, null, null, null, "kick", null, null, null, null, null, null, null, "kick", null, null, null],
      [null, null, null, null, null, null, null, null, "snare", null, null, null, null, null, null, "snare"],
      ["hihat", "hihat", "hihat", "hihat", "hihat", "hihat", "hihat", "hihat", "hihat", "hihat", "hihat", "hihat", "hihat", "hihat", "hihat", "hihat"],
      [null, "shaker", null, "shaker", null, "shaker", null, "shaker", null, "shaker", null, "shaker", null, "shaker", null, "shaker"],
    ],
    bassTrack: [1, null, null, null, null, null, null, null, 5, null, null, null, null, null, null, null],
    measureChords: [1, 2, 5, 5, 1, 2, 6, 5],
  },
  {
    name: "Electronic",
    bpm: 128,
    steps: 16,
    numMeasures: 4,
    toneVoice: "sub",
    tracks: [
      ["kick", null, null, null, "kick", null, null, null, "kick", null, null, null, "kick", null, null, null],
      [null, null, null, null, "snare", null, null, null, null, null, null, null, "snare", null, null, null],
      [null, null, "open_hihat", null, null, null, "open_hihat", null, null, null, "open_hihat", null, null, null, "open_hihat", null],
      ["crash", null, "hihat", null, "hihat", null, "hihat", null, "hihat", null, "hihat", null, "hihat", null, "hihat", null],
    ],
    bassTrack: [1, null, null, null, 1, null, null, null, 5, null, null, null, 5, null, null, null],
    measureChords: [1, 5, 6, 4],
  },
  {
    // Folk rock: straight kick/snare with offbeat hihats and shaker strum texture, I–V–vi–IV
    name: "Folk Rock",
    bpm: 112,
    steps: 16,
    numMeasures: 4,
    toneVoice: "warm",
    tracks: [
      ["kick", null, null, null, null, null, null, null, "kick", null, null, null, null, null, null, null],
      [null, null, null, null, "snare", null, null, null, null, null, null, null, "snare", null, null, null],
      [null, "hihat", null, "hihat", null, "hihat", null, "hihat", null, "hihat", null, "hihat", null, "hihat", null, "hihat"],
      ["shaker", null, "shaker", null, "shaker", null, "shaker", null, "shaker", null, "shaker", null, "shaker", null, "shaker", null],
    ],
    bassTrack: [1, null, null, null, null, null, null, null, 5, null, null, null, null, null, null, null],
    measureChords: [1, 5, 6, 4],
  },
  {
    name: "Funk",
    bpm: 100,
    steps: 16,
    numMeasures: 4,
    swingAmount: 0.08,
    toneVoice: "rhodes",
    tracks: [
      ["kick", null, null, "kick", null, null, "kick", null, null, null, "kick", null, null, "kick", null, null],
      [null, null, null, null, "snare", null, null, null, null, null, null, null, "snare", null, "snare", null],
      ["hihat", "hihat", "hihat", "hihat", "hihat", "hihat", "hihat", "hihat", "hihat", "hihat", "hihat", "hihat", "hihat", "hihat", "hihat", "hihat"],
      [null, null, null, null, null, null, "open_hihat", null, null, null, null, null, null, null, "open_hihat", null],
    ],
    bassTrack: [1, null, null, 1, null, null, null, 3, 5, null, null, 1, null, null, null, null],
    measureChords: [1, 4, 1, 5],
  },
  {
    // Gypsy Jazz: la pompe 2-beat feel, walking bass, Dorian minor with major IV
    name: "Gypsy Jazz",
    bpm: 200,
    steps: 16,
    numMeasures: 8,
    toneVoice: "clean",
    progMode: DiatonicMode.Dorian,
    swingAmount: 0.35,
    tracks: [
      ["kick", null, null, null, null, null, null, null, "kick", null, null, null, null, null, null, null],
      [null, null, null, null, "snare", null, null, null, null, null, null, null, "snare", null, null, null],
      ["hihat", null, "hihat", null, "hihat", null, "hihat", null, "hihat", null, "hihat", null, "hihat", null, "hihat", null],
      [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    ],
    bassTrack: [1, null, null, null, null, null, null, null, 2, null, null, null, null, null, null, null],
    measureChords: [1, 1, 4, 4, 2, 5, 1, 1],
  },
  {
    name: "Indie Rock",
    bpm: 118,
    steps: 16,
    numMeasures: 8,
    toneVoice: "overdrive",
    tracks: [
      ["kick", null, null, null, null, null, "kick", null, "kick", null, null, null, null, null, null, null],
      [null, null, null, null, "snare", null, null, null, null, null, null, null, "snare", null, null, null],
      ["hihat", null, "hihat", null, "hihat", null, "hihat", null, "hihat", null, "hihat", null, "hihat", null, "hihat", null],
      ["crash", null, "shaker", null, "shaker", null, "shaker", null, "shaker", null, "shaker", null, "shaker", null, "shaker", null],
    ],
    bassTrack: [1, null, null, null, null, null, null, null, 5, null, null, null, null, null, 7, null],
    measureChords: [1, 1, 5, 5, 6, 6, 4, 4],
  },
  {
    name: "Jazz Swing",
    bpm: 160,
    steps: 16,
    numMeasures: 8,
    swingAmount: 0.33,
    toneVoice: "rhodes",
    tracks: [
      [null, null, null, null, null, null, null, null, null, null, null, null, "kick", null, null, null],
      [null, null, null, null, "snare", null, null, null, null, null, null, null, "snare", null, null, null],
      ["hihat", null, null, null, "hihat", null, "hihat", null, "hihat", null, null, null, "hihat", null, "hihat", null],
      [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    ],
    bassTrack: [1, null, null, null, 2, null, null, null, 5, null, null, null, 4, null, null, null],
    measureChords: [1, 6, 2, 5, 1, 6, 2, 5],
  },
  {
    // Reggae one-drop: kick only on beat 3, hihat on offbeats, skank shaker on 8ths
    name: "Reggae",
    bpm: 80,
    steps: 16,
    numMeasures: 4,
    swingAmount: 0,
    toneVoice: "organ",
    progMode: DiatonicMode.Mixolydian,
    tracks: [
      ["kick", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, "snare", null, null, null, null, null, null, null],
      [null, null, "hihat", null, null, null, "hihat", null, null, null, "hihat", null, null, null, "hihat", null],
      [null, "shaker", null, "shaker", null, "shaker", null, "shaker", null, "shaker", null, "shaker", null, "shaker", null, "shaker"],
    ],
    bassTrack: [1, null, null, null, 4, null, null, null, null, null, null, null, 7, null, null, null],
    measureChords: [1, 4, 7, 4],
  },
  {
    name: "Rock Beat",
    bpm: 120,
    steps: 16,
    numMeasures: 4,
    toneVoice: "overdrive",
    tracks: [
      ["kick", null, null, null, null, null, null, null, "kick", null, null, "kick", null, null, null, null],
      [null, null, null, null, "snare", null, null, null, null, null, null, null, "snare", null, null, null],
      ["hihat", null, "hihat", null, "hihat", null, "hihat", null, "hihat", null, "hihat", null, "hihat", null, "hihat", null],
      ["crash", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    ],
    bassTrack: [1, null, null, null, null, null, null, null, 5, null, null, null, null, null, null, null],
    measureChords: [1, 4, 5, 1],
  },
];
