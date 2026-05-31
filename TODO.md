# PracTempo TODO List

This file tracks planned features, improvements, and bug fixes for PracTempo.

## General Features

*   Add a basic sheet music display tool (consider common notation, potentially MIDI integration).
*   Add a "chord hints" mode showing adjacent/related chord shapes based on the current scale/key.
*   Allow sub-intervals within a scheduled task (e.g., automatically cycle through keys during an interval).
*   Improve documentation around the schedule format, with hints for supported options per feature class.

## Music-Related Features

*   Refactor and expand the chord library (more voicings, inversions, additional chord types).
*   Add fretboard visualization modes (e.g., "magic squares", block/box patterns).
*   Find a suitable TAB format and implement TAB/lick display.
*   Implement an "overall capo" (alternate tuning) that transposes all features — scales, notes, chord shapes — to a given offset.
*   Add a catalog of fret marker icons (besides stars) and use them where appropriate.
*   Support display of lick/TAB notation snippets within a practice interval.
*   Clean up and better define functionality that shows important notes over chord changes.
*   Expand scale library (e.g., bebop scales, whole-tone, diminished).

## Audio

*   Support tempo changes within a backing track pattern.

## Infrastructure & Development

*   Add tests (unit, integration).
*   Support mobile/responsive design (including rotation).
*   Support multiple languages (internationalization/i18n).
*   Decompose some classes into more basic, reusable components.
*   Reconcile schedule view and reference view, consolidating into a single view.