# PracTempo

PracTempo is a practice timer application designed for musicians, offering scheduled intervals combined with context-specific visual aids and information. It helps structure practice sessions effectively, initially focusing on tools for guitarists. *Think of a highly customizable Pomodoro timer, which can display context and instructions about each task.*

Users define a practice schedule, and PracTempo tracks it with a timer and notifications. For each interval, PracTempo displays relevant visual aids like scale diagrams, chord shapes, or other contextual information.

## Try it out

If you want to see what all the fuss is about, you can try out PracTempo [here](https://html-preview.github.io/?url=https://github.com/RWLPedal/PracTempo/blob/main/index.html). Most powerful on desktop, but works on mobile too.

## Key Features

- **Multiple instruments:** Supports guitar (6, 7, or 8 strings), ukulele, mandolins and mandolas.
- **Left-handed support:** Native support for left-handed chord diagrams and scales. No more mentally rotating shapes in your head.
- **Scheduled Practice:** Define custom practice routines with timed intervals and completion notifications. The schedule editor supports drag-and-drop reordering, clipboard copy/paste, and keyboard shortcuts.
- **Reference Page:** Browse scales, chords, and other references outside of a practice session.
- **Contextual Hints:** Receive task-specific visualizations tailored to each practice item.
- **Floating Panels:** A modular system of draggable, resizable panels for practice aids (metronome, backing track, drone, chord progressions, etc.), with layout saved automatically.
- **Custom programming:** Configure attributes of panels to flow from one to another - use a backing track to highlight scale and chord tone changes, or use scales to power a chord progression diagram.
- **Themes:** Choose from multiple distinct visual themes.
- **Extensible:** Plugin-style feature registry makes it straightforward to add new instruments or practice tools.

## Fretboard-Specific Features

PracTempo includes a growing set of tools for fretted instrument players:

- **Fretboard Display:** Visualize scales and notes directly on an interactive fretboard diagram. Multiple scale or chord-tone layers can be overlaid on a single fretboard for side-by-side comparison.
- **Scale Library:** 30+ scale types, including major, minor, pentatonic, blues, and all seven modes.
- **Chord Diagrams:** Display standard chord shapes, with support for open and barre chords.
- **Chord Progressions:** Multi-chord progression visualization with configurable progressions.
- **Triads:** Display triad shapes across the neck, with multi-triad comparison.
- **CAGED System:** Visualize CAGED-position chord shapes.
- **Circle of Fifths:** Interactive circle of fifths diagram with major and relative-minor rings, highlighting diatonic chords and scale degrees for the selected key.
- **Capo Support:** Capo position selector to translate open chord shapes for guitarists.
- **Color Legend:** Color-coded scale degrees for quick visual reference.

## Audio Features

- **Metronome:** Visual and audio metronome, available as a standalone floating panel.
- **Drone:** Continuous pitch generator for tuning and ear training.
- **Backing Track:** Drum machine with configurable patterns, a bass line track, built-in chord progression playback, and swing control. Links to the signal system so harmony evolves with your practice item.
- **Strum Patterns:** Strum pattern player with presets.

## Building

PracTempo is developed using TypeScript and bundled with Webpack.

**Prerequisites:**

- Node.js and npm

**Build Steps:**

1. Navigate to the `ts` subdirectory:
   ```bash
   cd ts
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the project (outputs bundled JavaScript to `../js/`):
   ```bash
   npm run build
   ```
4. Start the local development server:
   ```bash
   npm run start
   ```
   This compiles TypeScript (entry point: `reference_main.ts`) and serves the application locally.
5. The server will be running at `localhost:4000`.

## Dependencies

- **Node.js / npm** — runtime and package management
- **TypeScript** — language and type checking
- **Webpack / tsify** — bundling
- **Bulma** — CSS framework for layout and panels

---

*(Developer Note: For a detailed list of planned features and tasks, please refer to `TODO.md`.)*
