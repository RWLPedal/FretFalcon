# FretFalcon User Guide

## Table of Contents

- [FretFalcon User Guide](#fretfalcon-user-guide)
  - [Table of Contents](#table-of-contents)
  - [Quickstart](#quickstart)
  - [Core Concepts](#core-concepts)
    - [The Panel System](#the-panel-system)
    - [Linking: Connecting Panels Together](#linking-connecting-panels-together)
    - [Signal Types](#signal-types)
    - [The Schedule](#the-schedule)
  - [Reference Views](#reference-views)
    - [Notes](#notes)
    - [Scales](#scales)
    - [Chords](#chords)
    - [Triads](#triads)
    - [Nearby Triads](#nearby-triads)
    - [Arpeggio](#arpeggio)
    - [Chord Progression](#chord-progression)
    - [CAGED](#caged)
    - [MultiFret](#multifret)
    - [Capo](#capo)
    - [Circle of Fifths](#circle-of-fifths)
    - [Legend](#legend)
  - [Practice Tool Views](#practice-tool-views)
    - [Backing Track](#backing-track)
    - [Metronome](#metronome)
    - [Timer](#timer)
    - [Strum](#strum)
  - [Schedule Views](#schedule-views)
    - [Schedule Editor](#schedule-editor)
    - [Any](#any)
  - [Testing](#testing)
  - [Dependencies](#dependencies)

---

## Quickstart

In this quickstart we'll set up a short practice session where a scale is shown that updates as a backing track plays through a chord progression.

1. **Open the app** using the downloaded compiled HTML file, or via npm run stat `localhost:4000` (dev), or at the hosted URL.

2. **Pick your instrument.** Click the gear icon in the sidebar to open settings. Select your instrument (Guitar, Ukulele, Mandolin, etc.) and tuning. For left-handed players, enable the left-hand toggle.

3. **Open the Scales view.** In the left sidebar under *Reference*, click **Scales**. A floating panel appears showing a fretboard scale diagram.

4. **Open the Backing Track.** Under *Practice Tools*, click **Backing Track**. A drum machine panel appears. Select from the *preset dropdown,* and a predefined backing track will be selected.

5. **Link them together.** Each panel has small circular handles on its edges. Drag from one of the Backing Track's handles to one of the Scales panel's handles. An arrow appears connecting them. Now when the Backing Track plays through its chord progression, the Scales panel will automatically update its root note to follow each chord.

6. **Press Play** on the Backing Track. The scale diagram updates in real time as the progression moves through its chords.

---

## Core Concepts

### The Panel System

FretFalcon is built around **floating panels** — draggable, resizable windows you arrange however you like. Open any view from the sidebar and it appears as a floating panel over the main workspace. Panels remember their positions and sizes between sessions.

Each panel has a **config toggle** (gear icon in its header) that reveals its configuration controls inline. Changes take effect immediately.

Most panels that display fretboard diagrams also have **rotate** and **zoom** controls in their headers.

### Linking: Connecting Panels Together

Since you might have many panels open at once, there can be a lot of options to consider. And worst of all, while you're practicing you likely want the panels to update automatically. **Linking** is the most powerful feature in FretFalcon. It lets one panel **drive** another in real time, so your visual aids stay in sync. Almost any kind of panel can drive other panels that make sense to receive it.

**How to create a link:**

Each panel has four **handle dots** — one on each edge (top, bottom, left, right). To link two panels:

1. Hover over a handle on the **source** panel (the one that will send data). The handle highlights.
2. **Click and drag** from the source handle toward the **target** panel (the one that will receive data).
3. Release over a handle on the target panel.
4. A labeled arrow appears between the panels. If you hover on the box at the center of the arrow, you can see which signal types are flowing across the connection.

**How to remove a link:**

Hover over the arrow between two linked panels to select it, then press **Delete** or use the remove button that appears on the informational panel.

**What linking does:**

When a source panel emits a signal (e.g., the Backing Track moves to a new chord), the signal travels along the link to the target panel, which updates its display immediately. The target panel's own manual controls are suspended for that property while it is being driven — it resumes manual control when the link is removed or the source stops.

When you first create a link, the target immediately receives the source's last-emitted signal, so it snaps into sync without waiting for the next update.

**Typical link patterns:**

| Source           | Target            | Effect                                              |
| ---------------- | ----------------- | --------------------------------------------------- |
| Backing Track    | Scales            | Scale root follows chord progression                |
| Backing Track    | Chords            | Chord diagram follows progression                   |
| Backing Track    | Metronome         | Metronome BPM/time signature syncs to backing track |
| Metronome        | Backing Track     | Backing track BPM follows metronome setting         |
| Circle of Fifths | Scales            | Scale root and mode follow key selection            |
| Circle of Fifths | Chord Progression | Progression key follows key selection               |
| Schedule (Any)   | Scales            | Scale shown matches the current schedule interval   |

### Signal Types

Every link carries one or more **signal types**, shown as small icons on the arrow:

| Icon | Signal      | What it carries                                       |
| ---- | ----------- | ----------------------------------------------------- |
| ♫    | **Chord**   | Chord root note, chord type, roman numeral in key     |
| ♭    | **Key**     | Scale root note and mode (Major, Dorian, Minor, etc.) |
| ♩    | **Groove**  | BPM, time signature, swing amount, and per-beat ticks |
| ◈    | **Feature** | Feature type and full config from a schedule interval |
| ▶    | **Play**    | Play/stop transport state                             |

A single link may carry multiple signal types simultaneously. For example, a link from Backing Track to Metronome carries both a Groove signal (BPM sync) and a Play signal (start/stop sync).

Buckle up, because some links can even see into the future. For example, boht the currently playing chord and the next chord to play in a backing track are sent along a link, so some panels are able to show either what to play now, or what to prepare to play next.

### The Schedule

The Schedule is a list of timed practice intervals. Each interval has:
- A **name** and **duration**
- An optional **feature** — a specific visual aid (scale, chord shape, arpeggio, etc.) shown while that interval is active
- Feature-specific **configuration** (which scale, which chord, etc.)

When the schedule is running, the built-in timer counts down each interval. An audio chime signals transitions. The **Any** panel displays whichever feature is configured for the current interval, updating automatically as intervals change.

You don't need a schedule to use FretFalcon — all views work independently for open-ended reference and practice.

---

## Reference Views

### Notes

Displays all notes on the fretboard — useful for fretboard memorization or as a simple reference.

**Config options:**
- **Highlight notes** — select specific notes to highlight (e.g., mark all C notes on the neck)
- Instrument and tuning are inherited from global settings

### Scales

Displays a scale on the fretboard with color-coded interval markings.

**Config options:**
- **Root Note** — the tonic of the scale (C, C#, D, … B)
- **Scale Name** — the scale type (Major, Natural Minor, Dorian, Pentatonic Major, Blues, etc.; 30+ options)
- **Highlight** — optionally emphasize specific scale degrees (root only, chord tones, etc.)

**When linked**, Root Note and Scale Name are driven by incoming Key or Chord signals from sources like the Backing Track or Circle of Fifths.

### Chords

Displays a chord diagram (open position or barre shape) for the selected chord.

**Config options:**
- **Root Note** — the chord root
- **Chord Type** — Major, Minor, Dominant 7th, Major 7th, sus2, sus4, etc.
- Position and voicing selection where multiple shapes are available
- **Movable** — A toggle that controls whether to show all common movable forms of the chord (barres). Note that if there is no open version of the requested chord available, then a single barre will be shown regardless of whether this is selected.

**When linked**, the chord root and type are driven by an incoming Chord signal. Useful for following a progression in real time.

### Triads

*(Guitar only)* Shows all triad shapes across the neck for a given root and quality, grouped by string set.

**Config options:**
- **Root Note** and **Triad Quality** (Major, Minor, Diminished, Augmented)
- **String Set** — which three adjacent strings to show shapes for
- Toggle between showing one shape per position or all positions simultaneously

Triads is a good companion to the Chord Progression view for visualizing the shapes behind each chord in a key.

### Nearby Triads

*(Guitar only)* Shows the triads closest to the current position or chord shape — useful for finding voice-leading connections and chord substitutions.

**Config options:**
- **Root Note**, **Chord Type**, and **Position** — the starting chord shape to find neighbors for
- **Distance** — how far up or down the neck to search

Use this alongside Chord Progression to find efficient triad movements between chords.

### Arpeggio

Displays arpeggio patterns on the fretboard for a given chord, showing where the chord tones fall across the entire neck.

**Config options:**
- **Root Note** and **Chord Type**
- Pattern layout and position range

**When linked** via a Chord signal, the root note updates to follow the source chord, letting you see arpeggio shapes change as a progression plays.

### Chord Progression
Displays multiple chord diagrams in sequence, representing the chords in the progression of a given key. Each chord's fretboard shape is shown, and the current chord is highlighted as it plays.

**Config options:**
- **Key** and **Mode** — sets the diatonic key for the progression
- **Progression** — the chord degrees to include (e.g., I–IV–V–I, i–VI–III–VII). You may reorder the degrees as well.
- Individual chord positions and voicings can be adjusted

**When linked** to a Backing Track (as a target), the key and mode are driven by the backing track's Key signal, so the progression stays in the same key as the track. Alternatively, link the Circle of Fifths to drive the key.

### CAGED

*(Guitar only)* Visualizes the five CAGED chord shapes (C, A, G, E, D positions) for a given root note and quality, showing how they connect across the neck.

**Config options:**
- **Root Note** and **Chord Quality**
- Toggle which CAGED positions to show
- Option to show the related scale pattern behind each shape

### MultiFret

Displays multiple scale or chord-tone layers overlaid on a single fretboard. Each layer can be independently configured, making it easy to compare scales side by side or visualize chord tones within a scale.

**Config options:**
- **Add/remove layers** — each layer has its own root note, scale/chord type, and color
- **Layer blend mode** — how overlapping notes from different layers are displayed

This is the most flexible fretboard view for theory analysis.

### Capo

Displays open chord shapes transposed for a given capo position. Select a capo fret and the view shows what chord shapes produce which actual-sounding chords.

**Config options:**
- **Capo fret** — 1 through 12
- **Chord** to display relative to the capo

Useful for quickly figuring out which open shapes to use when playing with a capo in a specific key.

### Circle of Fifths

An interactive diagram showing all twelve keys arranged in the circle of fifths, with an inner ring for relative minors. Clicking a key highlights the diatonic chords and scale degrees for that key.

**Config options:**
- **Root** and **Mode** — the currently selected key
- Toggle between showing major key diatonic chords or relative minor

**As a source**, the Circle of Fifths emits Key signals and Chord signals when you click a section. Link it to a Scales or Chord Progression view and clicking around the circle updates those panels immediately.

### Legend

Shows the color-to-interval mapping used across all fretboard diagrams — root, minor second, major second, minor third, etc. through the octave, with each interval's color swatch and name.

Open this alongside other fretboard views if you need a quick reference for what the colors mean. Desktop only.

---

## Practice Tool Views

### Backing Track

A configurable drum machine with a bass line track and chord progression playback. This is the primary signal source in most linked setups.

**Sections:**

- **Drum grid** — Toggle individual hits for kick, snare, hi-hat (closed/open), and other drum voices across the measure grid. Multiple patterns can be saved and cycled.
- **Bass line** — Enables a bass note track that follows the chord root of the current progression chord.
- **Chord progression** — Define the chords that cycle during playback. Each slot takes a chord root and type. The progression loops continuously.
- **Playback controls** — Play/Stop, BPM slider, time signature selector, swing control (0 = straight, 1 = full swing).

**As a signal source**, the Backing Track emits:
- **Chord signals** — on every chord change in the progression
- **Key signals** — the progression's home key and mode
- **Groove signals** — current BPM, time signature, and per-beat ticks
- **Play signals** — play/stop state

Linking the Backing Track to a Scales or Chords panel creates a live-updating visual as the progression cycles.

### Metronome

A visual and audio metronome. The pendulum swings and a click sounds on each beat (and subdivision, if configured).

**Config options:**
- **BPM** — beats per minute, adjustable by slider or by tapping the **Tap** button repeatedly
- **Time signature** — numerator (beats per measure) and denominator (note value per beat)
- **Subdivisions** — adds clicks between beats (e.g., eighth notes, triplets)
- **Volume** — click volume, independent of other audio

**As a signal source**, the Metronome emits Groove signals (BPM, time signature, swing) and Play signals. Link it to a Backing Track to keep BPM in sync, or link it to a visual metronome inside a Scales panel for a fully integrated practice view.

**As a link target**, the Metronome accepts Groove signals and updates its BPM and time signature to match the source (e.g., a Backing Track).

### Timer

A simple countdown timer for timed practice intervals outside of the full schedule system.

**Config options:**
- **Duration** — set hours, minutes, and seconds
- **Alert** — optional chime when time expires

Use Timer for ad-hoc sessions where you want a single countdown without a full schedule. For structured multi-interval sessions, use the Schedule Editor instead.

### Strum

Plays an animated strum pattern over a selected chord, synchronized to a beat. Useful for rhythm practice and visualizing strum direction.

**Config options:**
- **Pattern preset** — choose from several common strum patterns (down-up variations, syncopated patterns, etc.)
- **Chord** — root and type of the chord being strummed
- **BPM** — playback speed

**When linked** via a Chord signal, the strummed chord updates to match the source. **When linked** via a Groove signal, the BPM follows the source metronome or backing track.

---

## Schedule Views

### Schedule Editor

A full-featured editor for building and managing practice routines.

**Schedule structure:**
Each schedule is a list of **intervals**. Each interval has:
- **Name** — a label shown in the UI during practice (e.g., "C Major Scale – Position 1")
- **Duration** — countdown time for this interval (minutes and seconds)
- **Feature** — optional visual aid displayed in the Any panel during this interval (Scale, Chord, Arpeggio, etc.)
- **Feature config** — when a feature is selected, additional config fields appear (root note, scale type, etc.)

**Editing:**
- Click **+ Add Interval** to append a new row
- Drag the grip handle on the left of any row to reorder intervals
- Click the trash icon to delete an interval
- Use the copy/paste buttons to duplicate intervals or move them between sessions (clipboard format)
- **Keyboard shortcuts** in the editor: `Enter` to confirm edits, `Tab` to move between fields, `Delete` to remove the focused interval

**Running the schedule:**
Click **Start** (or the play button in the schedule floating panel) to begin. The timer counts down the first interval. When it expires, a chime sounds and the next interval begins automatically. Any linked **Any** panels switch to the new interval's feature immediately.

You can pause, skip to the next interval, or reset from the playback controls.

### Any

The **Any** panel is a dynamic display that renders whichever feature is configured for the currently active schedule interval. It acts as both a link target (receiving Feature signals from the schedule) and a standalone view (showing a manually-selected feature).

**Standalone use:** Open Any and use its config to select a feature type and configure it manually — it works as a generic host for any registered feature.

**In a schedule:** When the schedule is running, Any automatically switches its displayed feature to match the current interval. No manual interaction is needed.

**When linked** via a Feature signal from another source (advanced use), Any will render whatever feature that source emits.

Any is the glue that connects the schedule system to the visual aid system: build a schedule of practice items, open one Any panel, and it mirrors your session step by step.

## Testing

From the project root:

```bash
npm install       # first time only
npm test          # run all tests once
npm run test:watch  # re-run on file changes
```

## Dependencies

- **Node.js / npm** — runtime and package management
- **TypeScript** — language and type checking
- **Webpack / tsify** — bundling