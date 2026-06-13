// ts/fretboard/nearby_triads_algo.ts
import { FretboardConfig } from '../fretboard/fretboard_config';
import { TriadQuality, TriadInversion, TRIAD_SHAPE_CATALOG, catalogGroupForIntervalPattern } from './triads';
import { NOTE_NAMES_FROM_A, getKeyIndex, getIntervalLabel } from '../fretboard/fretboard_utils';

export interface TriadVoicing {
  chordKey: string;
  stringGroup: [number, number, number];
  frets: [number, number, number];
  notes: string[];           // note names in stringGroup order
  intervalLabels: string[];  // interval labels relative to chord root, in stringGroup order
  inversion: TriadInversion;
  quality: TriadQuality;
}

export interface RankedVoicing {
  voicing: TriadVoicing;
  cost: number;
}

const QUALITY_SUFFIX_MAP: Partial<Record<string, TriadQuality>> = {
  MAJ:  'Major',
  MIN:  'Minor',
  DIM:  'Diminished',
  AUG:  'Augmented',
  MAJ7: 'Major',
  MIN7: 'Minor',
  DOM7: 'Major',
  DIM7: 'Diminished',
  SUS2: 'Major',
  SUS4: 'Major',
};

export function parseChordKey(chordKey: string): { rootNote: string; quality: TriadQuality } | null {
  const idx = chordKey.indexOf('_');
  if (idx === -1) return null;
  const rootNote = chordKey.slice(0, idx);
  const suffix = chordKey.slice(idx + 1);
  const quality = QUALITY_SUFFIX_MAP[suffix] ?? null;
  if (!quality) return null;
  return { rootNote, quality };
}

export function enumerateVoicings(
  chordKey: string,
  fretboardConfig: FretboardConfig,
  fretCount: number = 15,
  maxFretSpan: number = 4
): TriadVoicing[] {
  const parsed = parseChordKey(chordKey);
  if (!parsed) return [];
  const { rootNote, quality } = parsed;

  const rootNoteIdx = getKeyIndex(rootNote);
  if (rootNoteIdx === -1) return [];

  const tuning = fretboardConfig.tuning.notes;
  const voicings: TriadVoicing[] = [];
  const addedKeys = new Set<string>();

  // Iterate every adjacent 3-string group the instrument actually has.
  // Map each to its catalog group by interval pattern so that e.g. [4,5,6]
  // on a 7-string (G-B-E, M3+P4) correctly uses the [3,4,5] catalog shapes.
  for (let s0 = 0; s0 + 2 < tuning.length; s0++) {
    const actualGroup: [number, number, number] = [s0, s0 + 1, s0 + 2];
    const catalogGroup = catalogGroupForIntervalPattern(actualGroup, tuning);

    for (const shape of TRIAD_SHAPE_CATALOG) {
      if (shape.quality !== quality) continue;
      if (shape.stringGroup[0] !== catalogGroup[0] ||
          shape.stringGroup[1] !== catalogGroup[1] ||
          shape.stringGroup[2] !== catalogGroup[2]) continue;

      const anchorStrIdx = actualGroup[shape.rootStringIndexInGroup];
      const anchorTuning = tuning[anchorStrIdx];
      const rootRelFret = shape.relativeFrets[shape.rootStringIndexInGroup];

      for (let anchorFret = 0; anchorFret <= fretCount; anchorFret++) {
        if ((anchorTuning + anchorFret) % 12 !== rootNoteIdx % 12) continue;

        const absFrets: [number, number, number] = [
          anchorFret + shape.relativeFrets[0] - rootRelFret,
          anchorFret + shape.relativeFrets[1] - rootRelFret,
          anchorFret + shape.relativeFrets[2] - rootRelFret,
        ];

        if (absFrets.some(f => f < 0 || f > fretCount)) continue;

        const frettedFrets = absFrets.filter(f => f > 0);
        const span = frettedFrets.length > 0
          ? Math.max(...absFrets) - Math.min(...frettedFrets)
          : 0;
        if (span > maxFretSpan) continue;

        const notes: string[] = [];
        const intervalLabels: string[] = [];
        let valid = true;
        for (let i = 0; i < 3; i++) {
          const noteIdx = (tuning[actualGroup[i]] + absFrets[i]) % 12;
          const noteName = NOTE_NAMES_FROM_A[noteIdx];
          if (!noteName) { valid = false; break; }
          notes.push(noteName);
          intervalLabels.push(getIntervalLabel((noteIdx - rootNoteIdx + 12) % 12));
        }
        if (!valid) continue;

        const key = `${actualGroup[0]}:${absFrets[0]},${actualGroup[1]}:${absFrets[1]},${actualGroup[2]}:${absFrets[2]}`;
        if (addedKeys.has(key)) continue;
        addedKeys.add(key);

        voicings.push({
          chordKey,
          stringGroup: [...actualGroup] as [number, number, number],
          frets: [...absFrets] as [number, number, number],
          notes,
          intervalLabels,
          inversion: shape.inversion,
          quality,
        });
      }
    }
  }

  return voicings;
}

const PERMUTATIONS: [number, number, number][] = [
  [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
];

function pairCost(
  fromStr: number, fromFret: number,
  toStr: number,   toFret: number
): number {
  if (fromStr === toStr) {
    const d = Math.abs(fromFret - toFret);
    return d === 0 ? 0 : d <= 3 ? d : 2 * d;
  }
  return 2 * Math.abs(toStr - fromStr) + Math.abs(toFret - fromFret);
}

export function transitionCost(from: TriadVoicing, to: TriadVoicing): number {
  let minCost = Infinity;
  for (const [p0, p1, p2] of PERMUTATIONS) {
    const cost =
      pairCost(from.stringGroup[0], from.frets[0], to.stringGroup[p0], to.frets[p0]) +
      pairCost(from.stringGroup[1], from.frets[1], to.stringGroup[p1], to.frets[p1]) +
      pairCost(from.stringGroup[2], from.frets[2], to.stringGroup[p2], to.frets[p2]);
    if (cost < minCost) minCost = cost;
  }
  return minCost === Infinity ? 0 : minCost;
}

function neckPosition(v: TriadVoicing): number {
  const fretted = v.frets.filter(f => f > 0);
  return fretted.length > 0 ? Math.min(...fretted) : 0;
}

function targetFretCost(v: TriadVoicing, targetFret: number | null): number {
  if (targetFret === null) return 0;
  return v.frets.reduce((sum, f) => sum + Math.abs(f - targetFret) * 0.5, 0);
}

function targetStringCost(v: TriadVoicing, targetString: number | null): number {
  if (targetString === null) return 0;
  return Math.min(...v.stringGroup.map(s => Math.abs(s - targetString)));
}

export function rankVoicingsByTransitionCost(
  from: TriadVoicing | null,
  candidates: TriadVoicing[],
  targetFret: number | null = null,
  targetString: number | null = null
): RankedVoicing[] {
  const targetCost = (v: TriadVoicing) => targetFretCost(v, targetFret) + targetStringCost(v, targetString);
  if (!from) {
    const hasTarget = targetFret !== null || targetString !== null;
    return candidates
      .map(v => ({ voicing: v, cost: hasTarget ? targetCost(v) : 0 }))
      .sort((a, b) => a.cost - b.cost || neckPosition(a.voicing) - neckPosition(b.voicing));
  }
  return candidates
    .map(v => ({ voicing: v, cost: transitionCost(from, v) + targetCost(v) }))
    .sort((a, b) => a.cost - b.cost || neckPosition(a.voicing) - neckPosition(b.voicing));
}

