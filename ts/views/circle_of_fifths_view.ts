// ts/views/circle_of_fifths_view.ts

import { BaseView } from '../base_view';
import { DiatonicMode, KeyType, ChordQuality } from '../fretboard/music_types';
import { scales } from '../fretboard/scales';
import { DriveSignal, SignalKind } from '../panels/link_types';

// ─── Circle of Fifths order ───────────────────────────────────────────────────

// Major keys in circle-of-fifths order (clockwise from top = C)
const COF_ORDER = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'];
// Relative minor labels (displayed in inner ring)
const COF_MINOR_LABELS = ['Am', 'Em', 'Bm', 'F#m', 'C#m', 'G#m', 'Ebm', 'Bbm', 'Fm', 'Cm', 'Gm', 'Dm'];
// Chromatic root of each relative minor
const COF_MINOR_ROOTS = ['A', 'E', 'B', 'F#', 'C#', 'G#', 'Eb', 'Bb', 'F', 'C', 'G', 'D'];

// ─── Chromatic note mapping ───────────────────────────────────────────────────

const CHROMATIC_NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const CHROMATIC_INDEX: Record<string, number> = {};
CHROMATIC_NOTES.forEach((n, i) => { CHROMATIC_INDEX[n] = i; });
// Enharmonic aliases
Object.assign(CHROMATIC_INDEX, { Db: 1, 'D#': 3, Gb: 6, 'G#': 8, 'A#': 10, Cb: 11, 'B#': 0 });

// Map from chromatic index → COF position (0-11)
const COF_CHROMA_TO_POS: Record<number, number> = {};
COF_ORDER.forEach((note, i) => { COF_CHROMA_TO_POS[CHROMATIC_INDEX[note] ?? -1] = i; });

// Correct note spellings per major key (sharps vs flats)
const MAJOR_KEY_NOTES: Record<string, string[]> = {
  'C':  ['C','D','E','F','G','A','B'],
  'G':  ['G','A','B','C','D','E','F#'],
  'D':  ['D','E','F#','G','A','B','C#'],
  'A':  ['A','B','C#','D','E','F#','G#'],
  'E':  ['E','F#','G#','A','B','C#','D#'],
  'B':  ['B','C#','D#','E','F#','G#','A#'],
  'F#': ['F#','G#','A#','B','C#','D#','E#'],
  'Db': ['Db','Eb','F','Gb','Ab','Bb','C'],
  'Ab': ['Ab','Bb','C','Db','Eb','F','G'],
  'Eb': ['Eb','F','G','Ab','Bb','C','D'],
  'Bb': ['Bb','C','D','Eb','F','G','A'],
  'F':  ['F','G','A','Bb','C','D','E'],
};

// Correct note spellings per natural minor key
const MINOR_KEY_NOTES: Record<string, string[]> = {
  'A':  ['A','B','C','D','E','F','G'],
  'E':  ['E','F#','G','A','B','C','D'],
  'B':  ['B','C#','D','E','F#','G','A'],
  'F#': ['F#','G#','A','B','C#','D','E'],
  'C#': ['C#','D#','E','F#','G#','A','B'],
  'G#': ['G#','A#','B','C#','D#','E','F#'],
  'Eb': ['Eb','F','Gb','Ab','Bb','Cb','Db'],
  'Bb': ['Bb','C','Db','Eb','F','Gb','Ab'],
  'F':  ['F','G','Ab','Bb','C','Db','Eb'],
  'C':  ['C','D','Eb','F','G','Ab','Bb'],
  'G':  ['G','A','Bb','C','D','Eb','F'],
  'D':  ['D','E','F','G','A','Bb','C'],
};

function keyEnharmonicMap(root: string, mode: DiatonicMode): Map<number, string> {
  const result = new Map<number, string>();
  let noteNames: string[] | undefined;
  if (mode === DiatonicMode.Ionian) {
    noteNames = MAJOR_KEY_NOTES[root];
  } else if (mode === DiatonicMode.Aeolian) {
    noteNames = MINOR_KEY_NOTES[root];
  } else {
    // Find relative major root (offset back to Ionian)
    const modeBackOffset: Partial<Record<DiatonicMode, number>> = {
      [DiatonicMode.Dorian]: 2, [DiatonicMode.Phrygian]: 4, [DiatonicMode.Lydian]: 5,
      [DiatonicMode.Mixolydian]: 7, [DiatonicMode.Locrian]: 11,
    };
    const offset = modeBackOffset[mode] ?? 0;
    if (offset > 0) {
      const majorRootIdx = ((CHROMATIC_INDEX[root] ?? 0) - offset + 12) % 12;
      const majorRoot = COF_ORDER.find(n => (CHROMATIC_INDEX[n] ?? -1) === majorRootIdx)
                     ?? CHROMATIC_NOTES[majorRootIdx];
      noteNames = MAJOR_KEY_NOTES[majorRoot];
    }
  }
  if (noteNames) {
    for (const name of noteNames) {
      const idx = CHROMATIC_INDEX[name];
      if (idx !== undefined) result.set(idx, name);
    }
  }
  return result;
}

// ─── Mode helpers ─────────────────────────────────────────────────────────────

const DIATONIC_MODE_CYCLE: DiatonicMode[] = [
  DiatonicMode.Ionian, DiatonicMode.Dorian, DiatonicMode.Phrygian,
  DiatonicMode.Lydian, DiatonicMode.Mixolydian, DiatonicMode.Aeolian, DiatonicMode.Locrian,
];

const DIATONIC_MODE_INDEX: Record<string, number> = {};
DIATONIC_MODE_CYCLE.forEach((m, i) => { DIATONIC_MODE_INDEX[m] = i; });

const MODE_SHORT: Record<DiatonicMode, string> = {
  [DiatonicMode.Ionian]:     'Ion',
  [DiatonicMode.Dorian]:     'Dor',
  [DiatonicMode.Phrygian]:   'Phr',
  [DiatonicMode.Lydian]:     'Lyd',
  [DiatonicMode.Mixolydian]: 'Mix',
  [DiatonicMode.Aeolian]:    'Aeo',
  [DiatonicMode.Locrian]:    'Loc',
};

const MODE_FULL: Record<DiatonicMode, string> = {
  [DiatonicMode.Ionian]:     'major',
  [DiatonicMode.Dorian]:     'Dorian',
  [DiatonicMode.Phrygian]:   'Phrygian',
  [DiatonicMode.Lydian]:     'Lydian',
  [DiatonicMode.Mixolydian]: 'Mixolydian',
  [DiatonicMode.Aeolian]:    'minor',
  [DiatonicMode.Locrian]:    'Locrian',
};

// ─── SVG helpers ──────────────────────────────────────────────────────────────

const SVG_NS = 'http://www.w3.org/2000/svg';
const CX = 150, CY = 150;
const R_OUTER = 140;  // outer edge of major-key ring
const R_MID   = 90;   // boundary between major-key and minor-key rings
const R_INNER = 50;   // inner edge of minor-key ring (= center hole radius)

function toRad(deg: number): number { return deg * Math.PI / 180; }

function polar(r: number, angleDeg: number): [number, number] {
  const a = toRad(angleDeg);
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

function wedgePath(r1: number, r2: number, startDeg: number, endDeg: number): string {
  const [x1, y1] = polar(r2, startDeg);
  const [x2, y2] = polar(r2, endDeg);
  const [x3, y3] = polar(r1, endDeg);
  const [x4, y4] = polar(r1, startDeg);
  return [
    `M ${x1.toFixed(2)} ${y1.toFixed(2)}`,
    `A ${r2} ${r2} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
    `L ${x3.toFixed(2)} ${y3.toFixed(2)}`,
    `A ${r1} ${r1} 0 0 0 ${x4.toFixed(2)} ${y4.toFixed(2)}`,
    'Z',
  ].join(' ');
}

function svgEl<T extends SVGElement>(tag: string, attrs: Record<string, string> = {}): T {
  const el = document.createElementNS(SVG_NS, tag) as T;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function svgText(x: number, y: number, cls: string, content = ''): SVGTextElement {
  const el = svgEl<SVGTextElement>('text', {
    x: x.toFixed(2), y: y.toFixed(2),
    'text-anchor': 'middle', 'dominant-baseline': 'central',
  });
  el.classList.add(cls);
  el.textContent = content;
  return el;
}

// ─── Music-theory helpers ─────────────────────────────────────────────────────

type ScaleInstance = typeof scales.MAJOR;

function getScale(mode: DiatonicMode): ScaleInstance | null {
  return (scales as Record<string, ScaleInstance>)[mode as string] ?? null;
}

function diatonicIndices(root: string, mode: DiatonicMode): Set<number> {
  const rootIdx = CHROMATIC_INDEX[root] ?? 0;
  const scale = getScale(mode);
  const result = new Set<number>();
  if (!scale) return result;
  for (const deg of scale.degrees) result.add((rootIdx + deg) % 12);
  return result;
}

interface ProgEntry {
  roman: string;
  chordName: string;
  modeLabel: string;
  chordKey: string;
  keyType: KeyType;
  quality: 'major' | 'minor' | 'dim';
}

function triadIndicesForChord(chordRoot: string, quality: ProgEntry['quality']): Set<number> {
  const rootIdx = CHROMATIC_INDEX[chordRoot] ?? 0;
  const ivs = quality === 'major' ? [0, 4, 7] : quality === 'minor' ? [0, 3, 7] : [0, 3, 6];
  return new Set(ivs.map(iv => (rootIdx + iv) % 12));
}

function triadIndicesForKey(root: string, mode: DiatonicMode): Set<number> {
  const scale = getScale(mode);
  const rootIdx = CHROMATIC_INDEX[root] ?? 0;
  if (!scale || scale.degrees.length < 5) return new Set([rootIdx]);
  return new Set([0, 2, 4].map(d => (rootIdx + scale.degrees[d]) % 12));
}

function progressionEntries(root: string, mode: DiatonicMode): ProgEntry[] {
  const scale = getScale(mode);
  if (!scale || scale.degrees.length !== 7) return [];
  const rootIdx = CHROMATIC_INDEX[root] ?? 0;
  const modeIdx = DIATONIC_MODE_INDEX[mode] ?? 0;
  const entries = scale.generateRomanEntries(false);
  return entries.map((e, i) => {
    const chordRootIdx = (rootIdx + e.degree) % 12;
    const chordRoot = CHROMATIC_NOTES[chordRootIdx];
    const chordKey = `${chordRoot}_${e.suffix}`;
    const degMode = DIATONIC_MODE_CYCLE[(modeIdx + i) % 7];
    const isDim   = e.quality === ChordQuality.Diminished;
    const isMinor = e.quality === ChordQuality.Minor || e.quality === ChordQuality.Minor7th;
    return {
      roman:     e.roman,
      chordName: chordRoot,
      modeLabel: MODE_SHORT[degMode],
      chordKey,
      keyType:   isMinor || isDim ? KeyType.Minor : KeyType.Major,
      quality:   isDim ? 'dim' : isMinor ? 'minor' : 'major',
    };
  });
}

// ─── View class ───────────────────────────────────────────────────────────────

export class CircleOfFifthsView extends BaseView {
  private selectedRoot: string;
  private selectedMode: DiatonicMode;
  private selectedIsMinor = false;
  private selectedChordIdx: number | null = null;
  private progressionCache: ProgEntry[] = [];

  // SVG element refs (populated in _buildSvg, cleared in destroy)
  private svgEl: SVGSVGElement | null = null;
  private wedgeGroups: SVGGElement[] = [];
  private innerGroups: SVGGElement[] = [];
  private romanTexts: SVGTextElement[] = [];
  private modeTexts: SVGTextElement[] = [];
  private keyLabelEls: SVGTextElement[] = [];

  private triadTriangleEl: SVGPolygonElement | null = null;

  // HTML element refs
  private viewEl: HTMLElement | null = null;
  private infoBarEl: HTMLElement | null = null;
  private progressionEl: HTMLElement | null = null;
  private chipEls: HTMLButtonElement[] = [];

  private cofResizeObserver: ResizeObserver | null = null;

  constructor(initialState?: any) {
    super();
    this.selectedRoot = (initialState?.root as string) ?? 'C';
    this.selectedMode = (initialState?.mode as DiatonicMode) ?? DiatonicMode.Ionian;
    this.selectedIsMinor = this.selectedMode === DiatonicMode.Aeolian;
  }

  render(container: HTMLElement): void {
    this.container = container;
    container.innerHTML = '';

    const view = document.createElement('div');
    view.classList.add('circle-of-fifths-view');
    this.viewEl = view;

    view.appendChild(this._buildSvg());

    this.infoBarEl = document.createElement('div');
    this.infoBarEl.classList.add('cof-info-bar');
    view.appendChild(this.infoBarEl);

    const progLabel = document.createElement('div');
    progLabel.classList.add('cof-progression-label');
    progLabel.textContent = 'PROGRESSION';
    view.appendChild(progLabel);

    this.progressionEl = document.createElement('div');
    this.progressionEl.classList.add('cof-progression');
    view.appendChild(this.progressionEl);

    container.appendChild(view);

    this.cofResizeObserver = new ResizeObserver(() => this._applySvgSize());
    this.cofResizeObserver.observe(container);

    this.listen(container, 'drive-signal', (e: Event) => {
      const { signal } = (e as CustomEvent<{ signal: DriveSignal }>).detail;
      if (signal.kind === SignalKind.Key) {
        const mode = (Object.values(DiatonicMode) as string[]).includes(signal.scaleKey)
          ? signal.scaleKey as DiatonicMode
          : DiatonicMode.Ionian;
        this._setKey(signal.rootNote, mode, false);
      } else if (signal.kind === SignalKind.Chord && signal.rootNote) {
        this._setKey(signal.rootNote, DiatonicMode.Ionian, false);
      }
    });

    this.listen(container, 'link-status-changed', (e: Event) => {
      const { hasIncomingLinks } = (e as CustomEvent<{ hasIncomingLinks: boolean }>).detail;
      this.infoBarEl?.classList.toggle('cof-info-bar--driven', hasIncomingLinks);
    });

    this._update();
    this._saveState();
  }

  private _buildSvg(): SVGSVGElement {
    const svg = svgEl<SVGSVGElement>('svg', { viewBox: '0 0 300 300' });
    svg.classList.add('cof-svg');
    this.svgEl = svg;

    const GAP = 0.8;

    for (let i = 0; i < 12; i++) {
      const s   = -90 + i * 30 + GAP / 2;
      const e   = -90 + (i + 1) * 30 - GAP / 2;
      const mid = -90 + (i + 0.5) * 30;

      // ── Outer (major key) group ──────────────────────────────────────────────
      const outerG = svgEl<SVGGElement>('g');
      outerG.classList.add('cof-wedge-group');
      outerG.style.cursor = 'pointer';
      outerG.addEventListener('click', () => this._onWedgeClick(i, false));

      const outerPath = svgEl<SVGPathElement>('path', { d: wedgePath(R_MID, R_OUTER, s, e) });
      outerPath.classList.add('cof-outer-path');
      outerG.appendChild(outerPath);

      const [rx, ry] = polar(131, mid);
      const romanEl = svgText(rx, ry, 'cof-roman-text');
      outerG.appendChild(romanEl);
      this.romanTexts.push(romanEl);

      const [kx, ky] = polar(115, mid);
      const keyLabelEl = svgText(kx, ky, 'cof-key-text', COF_ORDER[i]);
      outerG.appendChild(keyLabelEl);
      this.keyLabelEls.push(keyLabelEl);

      const [mx, my] = polar(100, mid);
      const modeEl = svgText(mx, my, 'cof-mode-text');
      outerG.appendChild(modeEl);
      this.modeTexts.push(modeEl);

      svg.appendChild(outerG);
      this.wedgeGroups.push(outerG);

      // ── Inner (relative minor) group ─────────────────────────────────────────
      const innerG = svgEl<SVGGElement>('g');
      innerG.classList.add('cof-inner-group');
      innerG.style.cursor = 'pointer';
      innerG.addEventListener('click', () => this._onWedgeClick(i, true));

      const innerPath = svgEl<SVGPathElement>('path', { d: wedgePath(R_INNER, R_MID, s, e) });
      innerPath.classList.add('cof-inner-path');
      innerG.appendChild(innerPath);

      const [mnx, mny] = polar(70, mid);
      innerG.appendChild(svgText(mnx, mny, 'cof-minor-text', COF_MINOR_LABELS[i]));

      svg.appendChild(innerG);
      this.innerGroups.push(innerG);
    }

    const centerCircle = svgEl<SVGCircleElement>('circle', {
      cx: String(CX), cy: String(CY), r: String(R_INNER - 1),
    });
    centerCircle.classList.add('cof-center-circle');
    svg.appendChild(centerCircle);

    const triadPoly = svgEl<SVGPolygonElement>('polygon');
    triadPoly.classList.add('cof-triad-triangle');
    triadPoly.style.display = 'none';
    svg.appendChild(triadPoly);
    this.triadTriangleEl = triadPoly;

    const dot = svgEl<SVGCircleElement>('circle', { cx: String(CX), cy: String(CY), r: '4' });
    dot.classList.add('cof-center-dot');
    svg.appendChild(dot);

    return svg;
  }

  private _onWedgeClick(idx: number, isMinor: boolean): void {
    const root = isMinor ? COF_MINOR_ROOTS[idx] : COF_ORDER[idx];
    const mode = isMinor ? DiatonicMode.Aeolian : DiatonicMode.Ionian;
    this.selectedIsMinor = isMinor;
    this._setKey(root, mode, true);
  }

  private _setKey(root: string, mode: DiatonicMode, emit: boolean): void {
    this.selectedRoot = root;
    this.selectedMode = mode;
    this.selectedIsMinor = mode === DiatonicMode.Aeolian;
    this.selectedChordIdx = null;
    this._update();
    this._saveState();
    if (emit) this._emitKeySelected();
  }

  private _update(): void {
    this._updateWedgesAndTitle();
    this._updateProgression();
  }

  private _updateWedgesAndTitle(): void {
    const diatonic = diatonicIndices(this.selectedRoot, this.selectedMode);
    const rootIdx  = CHROMATIC_INDEX[this.selectedRoot] ?? 0;
    const modeIdx  = DIATONIC_MODE_INDEX[this.selectedMode] ?? 0;
    const scale    = getScale(this.selectedMode);

    // Triad: chord tones of the selected chord chip, or I/III/V of the key if none selected.
    const selectedEntry = this.selectedChordIdx !== null
      ? this.progressionCache[this.selectedChordIdx] ?? null
      : null;
    const triad = selectedEntry
      ? triadIndicesForChord(selectedEntry.chordName, selectedEntry.quality)
      : triadIndicesForKey(this.selectedRoot, this.selectedMode);

    // Update triad triangle polygon
    if (this.triadTriangleEl) {
      const triadPositions: number[] = [];
      for (const ci of triad) {
        const pos = COF_CHROMA_TO_POS[ci];
        if (pos !== undefined) triadPositions.push(pos);
      }
      if (triadPositions.length === 3) {
        const triadRadius = this.selectedIsMinor ? 70 : 115;
        const pts = triadPositions.map(p => {
          const mid = -90 + (p + 0.5) * 30;
          const [x, y] = polar(triadRadius, mid);
          return `${x.toFixed(2)},${y.toFixed(2)}`;
        }).join(' ');
        this.triadTriangleEl.setAttribute('points', pts);
        this.triadTriangleEl.style.display = '';
      } else {
        this.triadTriangleEl.style.display = 'none';
      }
    }

    // Update key label text with enharmonically correct names for the selected key
    const enharmonicMap = keyEnharmonicMap(this.selectedRoot, this.selectedMode);
    for (let i = 0; i < 12; i++) {
      const outerIdx = CHROMATIC_INDEX[COF_ORDER[i]] ?? -1;
      const preferred = enharmonicMap.get(outerIdx);
      this.keyLabelEls[i].textContent = preferred ?? COF_ORDER[i];
    }

    for (let i = 0; i < 12; i++) {
      const outerIdx = CHROMATIC_INDEX[COF_ORDER[i]] ?? -1;
      const innerIdx = CHROMATIC_INDEX[COF_MINOR_ROOTS[i]] ?? -1;

      const outerIsRoot  = !this.selectedIsMinor && outerIdx === rootIdx;
      const innerIsRoot  =  this.selectedIsMinor && innerIdx === rootIdx;
      const outerIsInKey = !outerIsRoot && diatonic.has(outerIdx);
      const innerIsInKey = !innerIsRoot && diatonic.has(innerIdx);

      this.wedgeGroups[i].classList.toggle('cof-wedge--root',   outerIsRoot);
      this.wedgeGroups[i].classList.toggle('cof-wedge--in-key', outerIsInKey);
      this.innerGroups[i].classList.toggle('cof-inner--root',   innerIsRoot);
      this.innerGroups[i].classList.toggle('cof-inner--in-key', innerIsInKey);

      let roman = '';
      let modeLbl = '';
      if (scale && outerIdx >= 0 && diatonic.has(outerIdx)) {
        for (let d = 0; d < scale.degrees.length; d++) {
          if (((rootIdx + scale.degrees[d]) % 12) === outerIdx) {
            roman   = scale.getRomanNumeralAt(d);
            modeLbl = MODE_SHORT[DIATONIC_MODE_CYCLE[(modeIdx + d) % 7]];
            break;
          }
        }
      }
      this.romanTexts[i].textContent = roman;
      this.modeTexts[i].textContent  = modeLbl;
    }

    if (this.infoBarEl) {
      this.infoBarEl.textContent = `${this.selectedRoot} ${MODE_FULL[this.selectedMode]}`;
      // preserve driven indicator class added by link-status-changed
    }

    if (this.container) {
      this.container.dispatchEvent(new CustomEvent('feature-title-changed', {
        bubbles: true,
        detail: { title: `Circle of Fifths · ${this.selectedRoot} ${MODE_FULL[this.selectedMode]}` },
      }));
    }
  }

  private _updateProgression(): void {
    if (!this.progressionEl) return;
    this.progressionEl.innerHTML = '';
    this.chipEls = [];

    const entries = progressionEntries(this.selectedRoot, this.selectedMode);
    this.progressionCache = entries;
    entries.forEach((entry, i) => {
      const btn = document.createElement('button');
      btn.classList.add('cof-chord-chip');
      if (entry.quality === 'minor') btn.classList.add('cof-chip--minor');
      if (entry.quality === 'dim')   btn.classList.add('cof-chip--dim');
      btn.classList.toggle('is-active', i === this.selectedChordIdx);

      const romanSpan = document.createElement('span');
      romanSpan.classList.add('cof-chip-roman');
      romanSpan.textContent = entry.roman;

      const nameSpan = document.createElement('span');
      nameSpan.classList.add('cof-chip-name');
      nameSpan.textContent = entry.chordName;

      const modeSpan = document.createElement('span');
      modeSpan.classList.add('cof-chip-mode');
      modeSpan.textContent = entry.modeLabel;

      btn.appendChild(romanSpan);
      btn.appendChild(nameSpan);
      btn.appendChild(modeSpan);
      btn.addEventListener('click', () => this._onChipClick(i, entry));

      this.progressionEl!.appendChild(btn);
      this.chipEls.push(btn);
    });
  }

  private _onChipClick(idx: number, entry: ProgEntry): void {
    this.selectedChordIdx = this.selectedChordIdx === idx ? null : idx;
    // Re-run wedge highlighting with the new triad without rebuilding the chips.
    this._updateWedgesAndTitle();
    this.chipEls.forEach((btn, i) => btn.classList.toggle('is-active', i === this.selectedChordIdx));
    if (this.selectedChordIdx !== null) {
      this._emitChordSelected(entry);
    } else {
      this._emitKeySelected();
    }
  }

  private _emitKeySelected(): void {
    if (!this.container) return;
    this.container.dispatchEvent(new CustomEvent('cof-key-selected', {
      bubbles: true,
      detail: {
        root: this.selectedRoot, mode: this.selectedMode,
        chordKey: null, chordRoot: null, roman: null, keyType: null,
      },
    }));
  }

  private _emitChordSelected(entry: ProgEntry): void {
    if (!this.container) return;
    this.container.dispatchEvent(new CustomEvent('cof-key-selected', {
      bubbles: true,
      detail: {
        root: this.selectedRoot, mode: this.selectedMode,
        chordKey: entry.chordKey, chordRoot: entry.chordName,
        roman: entry.roman, keyType: entry.keyType,
      },
    }));
  }

  private _saveState(): void {
    if (!this.container) return;
    this.container.dispatchEvent(new CustomEvent('feature-state-changed', {
      bubbles: true,
      detail: { root: this.selectedRoot, mode: this.selectedMode },
    }));
  }

  private _applySvgSize(): void {
    if (!this.svgEl || !this.container || !this.viewEl) return;
    const W = this.container.clientWidth;
    const H = this.container.clientHeight;

    // Sum heights of all non-SVG children of the view div to find how much vertical
    // space the info bar and progression chips consume.
    let nonSvgH = 16; // 8px top + 8px bottom padding of .circle-of-fifths-view
    for (const child of Array.from(this.viewEl.children)) {
      if (child !== this.svgEl) nonSvgH += (child as HTMLElement).offsetHeight + 4; // 4px gap
    }
    nonSvgH += 4; // gap between the top padding edge and the SVG itself

    const size = Math.max(60, Math.min(W - 16, H - nonSvgH));
    this.svgEl.style.width  = `${size}px`;
    this.svgEl.style.height = `${size}px`;
  }

  destroy(): void {
    this.cofResizeObserver?.disconnect();
    this.cofResizeObserver = null;
    this.svgEl           = null;
    this.viewEl          = null;
    this.wedgeGroups     = [];
    this.innerGroups     = [];
    this.romanTexts      = [];
    this.modeTexts       = [];
    this.keyLabelEls     = [];
    this.triadTriangleEl = null;
    this.infoBarEl       = null;
    this.progressionEl   = null;
    this.chipEls         = [];
    super.destroy();
  }
}
