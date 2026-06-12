// ts/reference_page/nav_registry.ts
// Stores nav entries derived from discovered ViewModules.
// sidebar_view.ts and mobile components read from here instead of nav_sections.ts.

import { ViewId, NavSectionId, NavSection } from '../core/ids';
import { Visibility } from '../modules/module_types';

export { Visibility } from '../modules/module_types';

export interface NavEntry {
  viewId: ViewId;
  label: string;
  section: NavSectionId;
  visibility?: Visibility;
  requiredInstruments?: readonly string[];
}

const navEntries: NavEntry[] = [];

export function registerNavEntry(entry: NavEntry): void {
  navEntries.push(entry);
}

export function getNavEntries(): NavEntry[] {
  return [...navEntries];
}

// ─── Section groups ────────────────────────────────────────────────────────────

export interface NavSectionGroup {
  sectionId: NavSectionId;
  label: string;
  entries: NavEntry[];
}

const SECTION_LABELS: Record<NavSectionId, string> = {
  [NavSection.Fretboard]:     'Reference',
  [NavSection.PracticeTools]: 'Practice Tools',
  [NavSection.Sound]:         'Sound',
  [NavSection.Schedule]:      'Schedule',
  [NavSection.Utilities]:     'Utilities',
  [NavSection.Extensions]:    'Extensions',
};

const SECTION_ORDER: NavSectionId[] = [
  NavSection.Fretboard,
  NavSection.PracticeTools,
  NavSection.Sound,
  NavSection.Schedule,
  NavSection.Utilities,
  NavSection.Extensions,
];

/** Returns nav entries grouped and ordered by section for sidebar/menu rendering. */
export function getNavSectionGroups(): NavSectionGroup[] {
  const grouped = new Map<NavSectionId, NavEntry[]>();
  for (const entry of navEntries) {
    if (!grouped.has(entry.section)) grouped.set(entry.section, []);
    grouped.get(entry.section)!.push(entry);
  }
  return SECTION_ORDER
    .filter(s => grouped.has(s))
    .map(s => ({
      sectionId: s,
      label: SECTION_LABELS[s],
      entries: grouped.get(s)!,
    }));
}
