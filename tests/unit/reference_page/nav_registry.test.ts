// tests/unit/reference_page/nav_registry.test.ts
// nav_registry — the single nav source shared by the desktop sidebar and the mobile
// add-sheet. Both form factors render from this registry, so its ordering/grouping
// contract is device-facing even though the module is pure.
//
// The registry is a module-global array, so each test re-imports a fresh copy via
// vi.resetModules() + dynamic import.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NavSection, NavSectionId, viewId } from '../../../ts/core/ids';
import type { Visibility } from '../../../ts/modules/module_types';

type NavRegistry = typeof import('../../../ts/reference_page/nav_registry');

let reg: NavRegistry;

beforeEach(async () => {
  vi.resetModules();
  reg = await import('../../../ts/reference_page/nav_registry');
});

const entry = (
  id: string,
  section: NavSectionId = NavSection.Fretboard,
  visibility?: Visibility,
) => ({
  viewId: viewId(id),
  label: id,
  section,
  ...(visibility ? { visibility } : {}),
});

describe('registerNavEntry / getNavEntries', () => {
  it('starts empty and returns registered entries with visibility intact', () => {
    expect(reg.getNavEntries()).toEqual([]);
    reg.registerNavEntry(entry('scale', NavSection.Fretboard, reg.Visibility.Desktop));
    const entries = reg.getNavEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].visibility).toBe(reg.Visibility.Desktop);
  });

  it('returns a copy — mutating the result does not corrupt the registry', () => {
    reg.registerNavEntry(entry('scale'));
    reg.getNavEntries().pop();
    expect(reg.getNavEntries()).toHaveLength(1);
  });

  it('does NOT dedup double registration (intentional pin)', () => {
    // The registry appends blindly: registering the same entry twice yields two nav
    // buttons. Module discovery registers each module exactly once in production, so
    // this is safe there — but it is why importing a module twice in one process
    // double-registers. If you add dedup, update this pin.
    reg.registerNavEntry(entry('scale'));
    reg.registerNavEntry(entry('scale'));
    expect(reg.getNavEntries()).toHaveLength(2);
  });
});

describe('getNavSectionGroups', () => {
  it('groups by section in the fixed section order, skipping empty sections', () => {
    reg.registerNavEntry(entry('timer', NavSection.PracticeTools));
    reg.registerNavEntry(entry('scale', NavSection.Fretboard));
    reg.registerNavEntry(entry('legend', NavSection.Utilities));

    const groups = reg.getNavSectionGroups();
    expect(groups.map((g) => g.sectionId)).toEqual([
      NavSection.Fretboard,
      NavSection.PracticeTools,
      NavSection.Utilities,
    ]);
    // Every group carries a human label and only its own entries.
    for (const g of groups) {
      expect(g.label).toBeTruthy();
      expect(g.entries.every((e) => e.section === g.sectionId)).toBe(true);
    }
  });

  it('preserves registration order within a section', () => {
    reg.registerNavEntry(entry('scale', NavSection.Fretboard));
    reg.registerNavEntry(entry('triad', NavSection.Fretboard));
    reg.registerNavEntry(entry('caged', NavSection.Fretboard));
    const [fretboard] = reg.getNavSectionGroups();
    expect(fretboard.entries.map((e) => e.label)).toEqual(['scale', 'triad', 'caged']);
  });
});

describe('getVisibleNavGroups', () => {
  const labels = (groups: ReturnType<NavRegistry['getVisibleNavGroups']>) =>
    groups.flatMap((g) => g.entries.map((e) => e.label));

  it('hides desktop-only entries on mobile and mobile-only entries on desktop', () => {
    reg.registerNavEntry(entry('scale'));
    reg.registerNavEntry(entry('drone', NavSection.Fretboard, reg.Visibility.Desktop));
    reg.registerNavEntry(entry('pocket', NavSection.Fretboard, reg.Visibility.Mobile));
    reg.registerNavEntry(entry('timer', NavSection.Fretboard, reg.Visibility.Both));

    expect(labels(reg.getVisibleNavGroups({ formFactor: 'mobile' }))).toEqual([
      'scale',
      'pocket',
      'timer',
    ]);
    expect(labels(reg.getVisibleNavGroups({ formFactor: 'desktop' }))).toEqual([
      'scale',
      'drone',
      'timer',
    ]);
  });

  it('hides entries the current instrument does not support', () => {
    reg.registerNavEntry(entry('scale'));
    reg.registerNavEntry({ ...entry('caged'), requiredInstruments: ['Guitar'] });

    expect(labels(reg.getVisibleNavGroups({ formFactor: 'mobile', instrument: 'Guitar' }))).toEqual([
      'scale',
      'caged',
    ]);
    expect(labels(reg.getVisibleNavGroups({ formFactor: 'mobile', instrument: 'Bass' }))).toEqual([
      'scale',
    ]);
    // No instrument known: an instrument-gated entry cannot be offered.
    expect(labels(reg.getVisibleNavGroups({ formFactor: 'desktop' }))).toEqual(['scale']);
  });

  it('drops a section whose entries were all filtered out', () => {
    reg.registerNavEntry(entry('scale', NavSection.Fretboard));
    reg.registerNavEntry(entry('drone', NavSection.Sound, reg.Visibility.Desktop));
    expect(
      reg.getVisibleNavGroups({ formFactor: 'mobile' }).map((g) => g.sectionId),
    ).toEqual([NavSection.Fretboard]);
  });

  it('does not mutate the registry it filters', () => {
    reg.registerNavEntry(entry('drone', NavSection.Sound, reg.Visibility.Desktop));
    reg.getVisibleNavGroups({ formFactor: 'mobile' });
    expect(reg.getNavSectionGroups()[0].entries).toHaveLength(1);
  });
});
