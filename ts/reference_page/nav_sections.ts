export enum Visibility { DESKTOP = 'desktop', MOBILE = 'mobile', BOTH = 'both' }

export interface NavButton {
    id: string;
    label: string;
    viewId: string;
    featureTypeName?: string;
    requiredInstruments?: string[];
    visibility?: Visibility;
}

export interface NavSection {
    label: string;
    buttons: NavButton[];
}

export const NAV_SECTIONS: NavSection[] = [
    {
        label: 'Reference',
        buttons: [
            { id: 'notes-feature',             label: 'Notes',           viewId: 'instrument_notes' },
            { id: 'scales-feature',            label: 'Scales',          viewId: 'instrument_scale' },
            { id: 'chords-feature',            label: 'Chords',          viewId: 'instrument_chord',           requiredInstruments: ['Guitar', 'Ukulele', 'Charango', 'Mandolin', 'Mandola'] },
            { id: 'triads-feature',            label: 'Triads',          viewId: 'instrument_triad',           requiredInstruments: ['Guitar'] },
            { id: 'arpeggio-feature',          label: 'Arpeggio',        viewId: 'instrument_arpeggio' },
            { id: 'nearby-triads-feature',     label: 'Nearby Triads',   viewId: 'instrument_nearby_triads',   requiredInstruments: ['Guitar'] },
            { id: 'chord-progression-feature', label: 'Progression',     viewId: 'instrument_chord_progression',                                        requiredInstruments: ['Guitar', 'Mandolin', 'Mandola'] },
            { id: 'caged-feature',             label: 'CAGED',           viewId: 'instrument_caged',           requiredInstruments: ['Guitar'] },
            { id: 'multifret-feature',         label: 'MultiFret',       viewId: 'instrument_multifret' },
            { id: 'capo-feature',              label: 'Capo',            viewId: 'capo_view',                       requiredInstruments: ['Guitar', 'Ukulele', 'Mandolin', 'Mandola'] },
            { id: 'circle-of-fifths-feature',  label: 'Circle of 5ths',  viewId: 'circle_of_fifths' },
        ],
    },
    {
        label: 'Practice Tools',
        buttons: [
            { id: 'metronome-feature',    label: 'Metronome',     viewId: 'instrument_floating_metronome' },
            { id: 'timer-feature',        label: 'Timer',         viewId: 'floating_timer' },
            { id: 'drum-machine-feature', label: 'Backing Track', viewId: 'drum_machine' },
            { id: 'strum-view-feature',   label: 'Strum',         viewId: 'strum_view' },
            { id: 'drone-feature',        label: 'Drone',         viewId: 'drone_view',              visibility: Visibility.DESKTOP },
        ],
    },
    {
        label: 'Schedule',
        buttons: [
            { id: 'schedule-feature', label: 'Schedule Editor', viewId: 'schedule_floating_view' },
            { id: 'any-feature',      label: 'Any',            viewId: 'any_floating_view' },
        ],
    },
    {
        label: 'Utilities',
        buttons: [
            { id: 'global-key-feature', label: 'Global Key',  viewId: 'global_key' },
            { id: 'legend-feature',     label: 'Legend',      viewId: 'instrument_color_legend', visibility: Visibility.DESKTOP },
        ],
    },
];
