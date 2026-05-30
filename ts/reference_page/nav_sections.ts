export enum Visibility { DESKTOP = 'desktop', MOBILE = 'mobile', BOTH = 'both' }

export interface NavButton {
    id: string;
    icon: string;
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
            { id: 'notes-feature',             icon: 'music_note',      label: 'Notes',           viewId: 'instrument_notes' },
            { id: 'scales-feature',            icon: 'show_chart',      label: 'Scales',          viewId: 'instrument_scale' },
            { id: 'chords-feature',            icon: 'grid_on',         label: 'Chords',          viewId: 'instrument_chord',           requiredInstruments: ['Guitar', 'Ukulele', 'Charango', 'Mandolin', 'Mandola'] },
            { id: 'triads-feature',            icon: 'change_history',  label: 'Triads',          viewId: 'instrument_triad',           requiredInstruments: ['Guitar'] },
            { id: 'arpeggio-feature',          icon: 'linear_scale',    label: 'Arpeggio',        viewId: 'instrument_arpeggio' },
            { id: 'nearby-triads-feature',     icon: 'swap_horiz',      label: 'Nearby Triads',   viewId: 'instrument_nearby_triads',   requiredInstruments: ['Guitar'] },
            { id: 'chord-progression-feature', icon: 'arrow_forward',   label: 'Progression',     viewId: 'instrument_chord_progression',                                        requiredInstruments: ['Guitar', 'Mandolin', 'Mandola'] },
            { id: 'caged-feature',             icon: 'grid_view',       label: 'CAGED',           viewId: 'instrument_caged',           requiredInstruments: ['Guitar'] },
            { id: 'multifret-feature',         icon: 'layers',          label: 'MultiFret',       viewId: 'instrument_multifret' },
            { id: 'capo-feature',              icon: 'adjust',          label: 'Capo',            viewId: 'capo_view',                       requiredInstruments: ['Guitar', 'Ukulele', 'Mandolin', 'Mandola'] },
            { id: 'circle-of-fifths-feature',  icon: 'donut_large',     label: 'Circle of 5ths',  viewId: 'circle_of_fifths' },
        ],
    },
    {
        label: 'Practice Tools',
        buttons: [
            { id: 'metronome-feature',    icon: 'timer',       label: 'Metronome',     viewId: 'instrument_floating_metronome' },
            { id: 'timer-feature',        icon: 'alarm',       label: 'Timer',         viewId: 'floating_timer' },
            { id: 'drum-machine-feature', icon: 'queue_music', label: 'Backing Track', viewId: 'drum_machine' },
            { id: 'strum-view-feature',   icon: 'music_note',  label: 'Strum',         viewId: 'strum_view' },
            { id: 'drone-feature',        icon: 'graphic_eq',  label: 'Drone',         viewId: 'drone_view',                visibility: Visibility.DESKTOP },
            { id: 'legend-feature',       icon: 'palette',     label: 'Legend',        viewId: 'instrument_color_legend',   visibility: Visibility.DESKTOP },
        ],
    },
    {
        label: 'Schedule',
        buttons: [
            { id: 'schedule-feature', icon: 'event_note',   label: 'Schedule Editor', viewId: 'schedule_floating_view' },
            { id: 'any-feature',      icon: 'smart_display', label: 'Any',            viewId: 'any_floating_view' },
        ],
    },
];
