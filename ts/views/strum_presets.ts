// ts/views/strum_presets.ts
// Built-in strumming pattern presets for the StrumView.

import { StrokeAction, StrumPreset } from './strum_types';

// ─── 4/4 Guitar ───────────────────────────────────────────────────────────────

const GUITAR_4_4_EIGHTH: StrumPreset[] = [
  {
    _v: 1, id: 'g44_all_down', name: 'All Downs',
    instrument: 'Guitar', timeSig: { beats: 4, division: 4 },
    subdivision: 'eighth', isBuiltIn: true,
    slots: [
      StrokeAction.Stroke, StrokeAction.Rest,
      StrokeAction.Stroke, StrokeAction.Rest,
      StrokeAction.Stroke, StrokeAction.Rest,
      StrokeAction.Stroke, StrokeAction.Rest,
    ],
  },
  {
    _v: 1, id: 'g44_down_up', name: 'Down-Up',
    instrument: 'Guitar', timeSig: { beats: 4, division: 4 },
    subdivision: 'eighth', isBuiltIn: true,
    slots: [
      StrokeAction.Stroke, StrokeAction.Stroke,
      StrokeAction.Stroke, StrokeAction.Stroke,
      StrokeAction.Stroke, StrokeAction.Stroke,
      StrokeAction.Stroke, StrokeAction.Stroke,
    ],
  },
  {
    // D DU UDU
    _v: 1, id: 'g44_island', name: 'Island (D DU UDU)',
    instrument: 'Guitar', timeSig: { beats: 4, division: 4 },
    subdivision: 'eighth', isBuiltIn: true,
    slots: [
      StrokeAction.Stroke, StrokeAction.Rest,
      StrokeAction.Stroke, StrokeAction.Stroke,
      StrokeAction.Air,    StrokeAction.Stroke,
      StrokeAction.Stroke, StrokeAction.Stroke,
    ],
  },
  {
    // D chuck D chuck
    _v: 1, id: 'g44_country', name: 'Country Chug',
    instrument: 'Guitar', timeSig: { beats: 4, division: 4 },
    subdivision: 'eighth', isBuiltIn: true,
    slots: [
      StrokeAction.Stroke, StrokeAction.Chuck,
      StrokeAction.Stroke, StrokeAction.Chuck,
      StrokeAction.Stroke, StrokeAction.Chuck,
      StrokeAction.Stroke, StrokeAction.Chuck,
    ],
  },
  {
    // Muted downbeat + upstroke offbeats (reggae skank)
    _v: 1, id: 'g44_reggae', name: 'Reggae Skank',
    instrument: 'Guitar', timeSig: { beats: 4, division: 4 },
    subdivision: 'eighth', isBuiltIn: true,
    slots: [
      StrokeAction.Chuck,  StrokeAction.Stroke,
      StrokeAction.Chuck,  StrokeAction.Stroke,
      StrokeAction.Chuck,  StrokeAction.Stroke,
      StrokeAction.Chuck,  StrokeAction.Stroke,
    ],
  },
  {
    // D D DU D DU
    _v: 1, id: 'g44_folk', name: 'Folk (D D DU D DU)',
    instrument: 'Guitar', timeSig: { beats: 4, division: 4 },
    subdivision: 'eighth', isBuiltIn: true,
    slots: [
      StrokeAction.Stroke, StrokeAction.Rest,
      StrokeAction.Stroke, StrokeAction.Stroke,
      StrokeAction.Stroke, StrokeAction.Rest,
      StrokeAction.Stroke, StrokeAction.Stroke,
    ],
  },
  {
    // D DU UDU with accent on beat 1
    _v: 1, id: 'g44_rock', name: 'Rock Accent',
    instrument: 'Guitar', timeSig: { beats: 4, division: 4 },
    subdivision: 'eighth', isBuiltIn: true,
    slots: [
      StrokeAction.Accent, StrokeAction.Rest,
      StrokeAction.Stroke, StrokeAction.Stroke,
      StrokeAction.Stroke, StrokeAction.Rest,
      StrokeAction.Stroke, StrokeAction.Stroke,
    ],
  },
  {
    // DDU DDU DDU DDU
    _v: 1, id: 'g44_constant', name: 'Constant Motion',
    instrument: 'Guitar', timeSig: { beats: 4, division: 4 },
    subdivision: 'eighth', isBuiltIn: true,
    slots: [
      StrokeAction.Stroke, StrokeAction.Stroke,
      StrokeAction.Air,    StrokeAction.Stroke,
      StrokeAction.Stroke, StrokeAction.Stroke,
      StrokeAction.Air,    StrokeAction.Stroke,
    ],
  },
];

// ─── 3/4 Guitar ───────────────────────────────────────────────────────────────

const GUITAR_3_4_EIGHTH: StrumPreset[] = [
  {
    _v: 1, id: 'g34_waltz_down', name: 'Waltz (All Downs)',
    instrument: 'Guitar', timeSig: { beats: 3, division: 4 },
    subdivision: 'eighth', isBuiltIn: true,
    slots: [
      StrokeAction.Stroke, StrokeAction.Rest,
      StrokeAction.Stroke, StrokeAction.Rest,
      StrokeAction.Stroke, StrokeAction.Rest,
    ],
  },
  {
    // D DU DU
    _v: 1, id: 'g34_waltz_du', name: 'Waltz (D DU DU)',
    instrument: 'Guitar', timeSig: { beats: 3, division: 4 },
    subdivision: 'eighth', isBuiltIn: true,
    slots: [
      StrokeAction.Stroke, StrokeAction.Rest,
      StrokeAction.Stroke, StrokeAction.Stroke,
      StrokeAction.Stroke, StrokeAction.Stroke,
    ],
  },
  {
    // Accent on 1, light on 2 & 3
    _v: 1, id: 'g34_ballad', name: 'Ballad',
    instrument: 'Guitar', timeSig: { beats: 3, division: 4 },
    subdivision: 'eighth', isBuiltIn: true,
    slots: [
      StrokeAction.Accent, StrokeAction.Rest,
      StrokeAction.Stroke, StrokeAction.Rest,
      StrokeAction.Stroke, StrokeAction.Rest,
    ],
  },
  {
    // D chuck DU chuck DU
    _v: 1, id: 'g34_country', name: 'Country 3/4',
    instrument: 'Guitar', timeSig: { beats: 3, division: 4 },
    subdivision: 'eighth', isBuiltIn: true,
    slots: [
      StrokeAction.Stroke, StrokeAction.Chuck,
      StrokeAction.Stroke, StrokeAction.Stroke,
      StrokeAction.Stroke, StrokeAction.Stroke,
    ],
  },
  {
    _v: 1, id: 'g34_full', name: 'Full Strum',
    instrument: 'Guitar', timeSig: { beats: 3, division: 4 },
    subdivision: 'eighth', isBuiltIn: true,
    slots: [
      StrokeAction.Stroke, StrokeAction.Stroke,
      StrokeAction.Stroke, StrokeAction.Stroke,
      StrokeAction.Stroke, StrokeAction.Stroke,
    ],
  },
];

// ─── 4/4 Ukulele ──────────────────────────────────────────────────────────────

const UKE_4_4_EIGHTH: StrumPreset[] = [
  {
    _v: 1, id: 'uke44_island', name: 'Island (D DU UDU)',
    instrument: 'Ukulele', timeSig: { beats: 4, division: 4 },
    subdivision: 'eighth', isBuiltIn: true,
    slots: [
      StrokeAction.Stroke, StrokeAction.Rest,
      StrokeAction.Stroke, StrokeAction.Stroke,
      StrokeAction.Air,    StrokeAction.Stroke,
      StrokeAction.Stroke, StrokeAction.Stroke,
    ],
  },
  {
    // Skank: offbeat upstrokes only
    _v: 1, id: 'uke44_skank', name: 'Skank (offbeats)',
    instrument: 'Ukulele', timeSig: { beats: 4, division: 4 },
    subdivision: 'eighth', isBuiltIn: true,
    slots: [
      StrokeAction.Rest,   StrokeAction.Stroke,
      StrokeAction.Rest,   StrokeAction.Stroke,
      StrokeAction.Rest,   StrokeAction.Stroke,
      StrokeAction.Rest,   StrokeAction.Stroke,
    ],
  },
  {
    _v: 1, id: 'uke44_down_up', name: 'Down-Up',
    instrument: 'Ukulele', timeSig: { beats: 4, division: 4 },
    subdivision: 'eighth', isBuiltIn: true,
    slots: [
      StrokeAction.Stroke, StrokeAction.Stroke,
      StrokeAction.Stroke, StrokeAction.Stroke,
      StrokeAction.Stroke, StrokeAction.Stroke,
      StrokeAction.Stroke, StrokeAction.Stroke,
    ],
  },
  {
    _v: 1, id: 'uke44_chuck', name: 'Chucka (D X DU X)',
    instrument: 'Ukulele', timeSig: { beats: 4, division: 4 },
    subdivision: 'eighth', isBuiltIn: true,
    slots: [
      StrokeAction.Stroke, StrokeAction.Chuck,
      StrokeAction.Stroke, StrokeAction.Stroke,
      StrokeAction.Chuck,  StrokeAction.Stroke,
      StrokeAction.Stroke, StrokeAction.Chuck,
    ],
  },
  {
    _v: 1, id: 'uke44_calypso', name: 'Calypso',
    instrument: 'Ukulele', timeSig: { beats: 4, division: 4 },
    subdivision: 'eighth', isBuiltIn: true,
    slots: [
      StrokeAction.Stroke, StrokeAction.Rest,
      StrokeAction.Stroke, StrokeAction.Air,
      StrokeAction.Stroke, StrokeAction.Stroke,
      StrokeAction.Air,    StrokeAction.Stroke,
    ],
  },
];

// ─── 3/4 Ukulele ──────────────────────────────────────────────────────────────

const UKE_3_4_EIGHTH: StrumPreset[] = [
  {
    _v: 1, id: 'uke34_waltz', name: 'Waltz',
    instrument: 'Ukulele', timeSig: { beats: 3, division: 4 },
    subdivision: 'eighth', isBuiltIn: true,
    slots: [
      StrokeAction.Stroke, StrokeAction.Rest,
      StrokeAction.Stroke, StrokeAction.Stroke,
      StrokeAction.Stroke, StrokeAction.Stroke,
    ],
  },
  {
    _v: 1, id: 'uke34_full', name: 'Full Swing',
    instrument: 'Ukulele', timeSig: { beats: 3, division: 4 },
    subdivision: 'eighth', isBuiltIn: true,
    slots: [
      StrokeAction.Stroke, StrokeAction.Stroke,
      StrokeAction.Stroke, StrokeAction.Stroke,
      StrokeAction.Stroke, StrokeAction.Stroke,
    ],
  },
  {
    _v: 1, id: 'uke34_skank', name: 'Skank 3/4',
    instrument: 'Ukulele', timeSig: { beats: 3, division: 4 },
    subdivision: 'eighth', isBuiltIn: true,
    slots: [
      StrokeAction.Rest,   StrokeAction.Stroke,
      StrokeAction.Rest,   StrokeAction.Stroke,
      StrokeAction.Rest,   StrokeAction.Stroke,
    ],
  },
];

// ─── 4/4 Mandolin / Mandola ───────────────────────────────────────────────────

const MANDOLIN_4_4_EIGHTH: StrumPreset[] = [
  {
    // All downstrokes — basic chop rhythm
    _v: 1, id: 'mand44_chop', name: 'Chop (offbeats)',
    instrument: 'Mandolin', timeSig: { beats: 4, division: 4 },
    subdivision: 'eighth', isBuiltIn: true,
    slots: [
      StrokeAction.Rest,   StrokeAction.Chuck,
      StrokeAction.Rest,   StrokeAction.Chuck,
      StrokeAction.Rest,   StrokeAction.Chuck,
      StrokeAction.Rest,   StrokeAction.Chuck,
    ],
  },
  {
    _v: 1, id: 'mand44_down_up', name: 'Down-Up Strum',
    instrument: 'Mandolin', timeSig: { beats: 4, division: 4 },
    subdivision: 'eighth', isBuiltIn: true,
    slots: [
      StrokeAction.Stroke, StrokeAction.Stroke,
      StrokeAction.Stroke, StrokeAction.Stroke,
      StrokeAction.Stroke, StrokeAction.Stroke,
      StrokeAction.Stroke, StrokeAction.Stroke,
    ],
  },
  {
    _v: 1, id: 'mand44_accent_chop', name: 'Accent + Chop',
    instrument: 'Mandolin', timeSig: { beats: 4, division: 4 },
    subdivision: 'eighth', isBuiltIn: true,
    slots: [
      StrokeAction.Accent, StrokeAction.Chuck,
      StrokeAction.Stroke, StrokeAction.Chuck,
      StrokeAction.Stroke, StrokeAction.Chuck,
      StrokeAction.Stroke, StrokeAction.Chuck,
    ],
  },
  {
    _v: 1, id: 'mand44_bluegrass', name: 'Bluegrass Chop',
    instrument: 'Mandolin', timeSig: { beats: 4, division: 4 },
    subdivision: 'eighth', isBuiltIn: true,
    slots: [
      StrokeAction.Stroke, StrokeAction.Chuck,
      StrokeAction.Air,    StrokeAction.Chuck,
      StrokeAction.Stroke, StrokeAction.Chuck,
      StrokeAction.Air,    StrokeAction.Chuck,
    ],
  },
  {
    _v: 1, id: 'mand44_irish', name: 'Irish Jig Feel',
    instrument: 'Mandolin', timeSig: { beats: 4, division: 4 },
    subdivision: 'eighth', isBuiltIn: true,
    slots: [
      StrokeAction.Accent, StrokeAction.Stroke,
      StrokeAction.Stroke, StrokeAction.Stroke,
      StrokeAction.Accent, StrokeAction.Stroke,
      StrokeAction.Stroke, StrokeAction.Stroke,
    ],
  },
];

const MANDOLA_4_4_EIGHTH: StrumPreset[] = MANDOLIN_4_4_EIGHTH.map(p => ({
  ...p,
  id: p.id.replace('mand44', 'mandola44'),
  instrument: 'Mandola' as const,
}));

// ─── 3/4 Mandolin / Mandola ──────────────────────────────────────────────────

const MANDOLIN_3_4_EIGHTH: StrumPreset[] = [
  {
    _v: 1, id: 'mand34_waltz_chop', name: 'Waltz Chop',
    instrument: 'Mandolin', timeSig: { beats: 3, division: 4 },
    subdivision: 'eighth', isBuiltIn: true,
    slots: [
      StrokeAction.Stroke, StrokeAction.Chuck,
      StrokeAction.Stroke, StrokeAction.Chuck,
      StrokeAction.Stroke, StrokeAction.Chuck,
    ],
  },
  {
    _v: 1, id: 'mand34_waltz_down', name: 'Waltz Down',
    instrument: 'Mandolin', timeSig: { beats: 3, division: 4 },
    subdivision: 'eighth', isBuiltIn: true,
    slots: [
      StrokeAction.Accent, StrokeAction.Rest,
      StrokeAction.Stroke, StrokeAction.Rest,
      StrokeAction.Stroke, StrokeAction.Rest,
    ],
  },
  {
    _v: 1, id: 'mand34_offbeat_chop', name: 'Offbeat Chop',
    instrument: 'Mandolin', timeSig: { beats: 3, division: 4 },
    subdivision: 'eighth', isBuiltIn: true,
    slots: [
      StrokeAction.Rest,   StrokeAction.Chuck,
      StrokeAction.Rest,   StrokeAction.Chuck,
      StrokeAction.Rest,   StrokeAction.Chuck,
    ],
  },
];

const MANDOLA_3_4_EIGHTH: StrumPreset[] = MANDOLIN_3_4_EIGHTH.map(p => ({
  ...p,
  id: p.id.replace('mand34', 'mandola34'),
  instrument: 'Mandola' as const,
}));

// ─── Full built-in preset list ────────────────────────────────────────────────

export const BUILT_IN_PRESETS: StrumPreset[] = [
  ...GUITAR_4_4_EIGHTH,
  ...GUITAR_3_4_EIGHTH,
  ...UKE_4_4_EIGHTH,
  ...UKE_3_4_EIGHTH,
  ...MANDOLIN_4_4_EIGHTH,
  ...MANDOLA_4_4_EIGHTH,
  ...MANDOLIN_3_4_EIGHTH,
  ...MANDOLA_3_4_EIGHTH,
];
