import { registerCategory } from "./feature_registry";
import { registerFloatingView } from "./panels/panel_registry";
import { FretboardFloatingViewDescriptor } from "./panels/panel_types";
import { instrumentCategory } from "./fretboard/fretboard_category";
import { TimerView } from "./views/timer_view";
import { DroneView } from "./views/drone_view";
import { ScheduleFloatingView } from "./views/schedule_floating_view";
import { AnyFloatingView } from "./views/any_floating_view";
import { AnyFeature } from "./fretboard/features/any_feature";
import { BackingTrackView } from "./views/backing_track_view";
import { CapoView } from "./fretboard/views/capo_view";
import { ConfigurableFeatureView } from "./views/configurable_feature_view";
import { ColorLegendView } from "./fretboard/views/color_legend_view";
import { MetronomeView } from "./fretboard/views/metronome_view";
import { StrumView } from "./views/strum_view";
import { CircleOfFifthsView } from "./views/circle_of_fifths_view";
import { GlobalKeyView, GLOBAL_KEY_VIEW_ID } from "./views/global_key_view";
import { NotesFeature } from "./fretboard/features/notes_feature";
import { ScaleFeature } from "./fretboard/features/scale_feature";
import { ChordFeature } from "./fretboard/features/chord_feature";
import { TriadFeature } from "./fretboard/features/triad_feature";
import { NearbyTriadsFeature } from "./fretboard/features/nearby_triads_feature";
import { CagedFeature } from "./fretboard/features/caged_feature";
import { MultiLayerFretboardFeature } from "./fretboard/features/multi_layer_fretboard_feature";
import { ChordProgressionFeature } from "./fretboard/features/chord_progression_feature";
import { ArpeggioFeature } from "./fretboard/features/arpeggio_feature";
import { InstrumentIntervalSettings } from "./fretboard/fretboard_interval_settings";
import { AudioController } from "./audio_controller";
import { AppSettings } from "./settings";

export function registerBuiltins(): void {
  registerCategory(instrumentCategory);

  registerFloatingView({
    viewId: "floating_timer",
    displayName: "Timer",
    icon: "alarm",
    defaultWidth: 300,
    defaultHeight: 150,
    minWidth: 195,
    minHeight: 105,
    createView: (initialState?: any) =>
      new TimerView(initialState?.duration ?? 300),
  });

  registerFloatingView({
    viewId: "drone_view",
    displayName: "Drone",
    icon: "graphic_eq",
    defaultWidth: 320,
    defaultHeight: 80,
    minHeight: 80,
    minWidth: 310,
    createView: (initialState?: any) => new DroneView(initialState),
  });

  registerFloatingView({
    viewId: "schedule_floating_view",
    displayName: "Schedule",
    icon: "event_note",
    defaultWidth: 900,
    defaultHeight: 800,
    minWidth: 600,
    minHeight: 600,
    showInMenu: false,
    createView: (initialState?: any, appSettings?: AppSettings) =>
      new ScheduleFloatingView(initialState, appSettings!),
  });

  registerFloatingView({
    viewId: "any_floating_view",
    displayName: "Any",
    icon: "smart_display",
    defaultWidth: 420,
    defaultHeight: 550,
    showInMenu: false,
    createView: (initialState?: any, appSettings?: AppSettings) =>
      new AnyFloatingView(initialState, appSettings!),
  });

  registerFloatingView({
    viewId: "any_feature",
    displayName: "Any Feature",
    icon: "smart_display",
    defaultWidth: 420,
    defaultHeight: 550,
    showInMenu: false,
    supportsConfigToggle: true,
    createView: (initialState?: any, appSettings?: AppSettings) =>
      new ConfigurableFeatureView(
        {
          categoryName: "Instrument",
          featureTypeName: AnyFeature.typeName,
          ...initialState,
        },
        appSettings!,
      ),
  });

  registerFloatingView({
    viewId: "drum_machine",
    displayName: "Backing Track",
    icon: "queue_music",
    defaultWidth: 575,
    defaultHeight: 300,
    minWidth: 575,
    minHeight: 300,
    createView: (initialState?: any) => new BackingTrackView(initialState),
  });

  registerFloatingView({
    viewId: "capo_view",
    displayName: "Capo",
    icon: "adjust",
    defaultWidth: 240,
    defaultHeight: 350,
    createView: (_initialState?: any, appSettings?: AppSettings) =>
      new CapoView(appSettings!),
  });

  registerFloatingView({
    viewId: "instrument_color_legend",
    displayName: "Color Legend",
    icon: "palette",
    refreshOnInstrumentChange: true,
    defaultWidth: 180,
    createView: (_initialState?: any, appSettings?: AppSettings) => {
      if (!appSettings) {
        console.error("AppSettings not provided to ColorLegendView factory!");
        return {
          render: (c: HTMLElement) =>
            (c.textContent = "Error: Settings unavailable."),
          start() {},
          stop() {},
          destroy() {},
        };
      }
      return new ColorLegendView(appSettings);
    },
  });

  registerFloatingView({
    viewId: "configurable_instrument_feature",
    displayName: "Configurable Feature",
    icon: "tune",
    refreshOnInstrumentChange: true,
    defaultWidth: 420,
    defaultHeight: 550,
    showInMenu: false,
    supportsConfigToggle: true,
    isFretboardView: true,
    supportsRotate: true,
    supportsZoom: true,
    createView: (initialState?: any, appSettings?: AppSettings) =>
      new ConfigurableFeatureView(
        { categoryName: "Instrument", ...initialState },
        appSettings!,
      ),
  } as FretboardFloatingViewDescriptor);

  registerFloatingView({
    viewId: "instrument_notes",
    displayName: "Notes",
    icon: "music_note",
    featureTypeName: NotesFeature.typeName,
    refreshOnInstrumentChange: true,
    defaultWidth: 420,
    defaultHeight: 550,
    showInMenu: false,
    supportsConfigToggle: true,
    isFretboardView: true,
    supportsRotate: true,
    supportsZoom: true,
    createView: (initialState?: any, appSettings?: AppSettings) => {
      const featureTypeName =
        initialState?.featureTypeName ?? NotesFeature.typeName;
      return new ConfigurableFeatureView(
        { ...initialState, categoryName: "Instrument", featureTypeName },
        appSettings!,
      );
    },
  } as FretboardFloatingViewDescriptor);

  registerFloatingView({
    viewId: "instrument_scale",
    displayName: "Scale",
    icon: "show_chart",
    featureTypeName: ScaleFeature.typeName,
    refreshOnInstrumentChange: true,
    defaultWidth: 420,
    defaultHeight: 550,
    showInMenu: false,
    supportsConfigToggle: true,
    isFretboardView: true,
    supportsRotate: true,
    supportsZoom: true,
    createView: (initialState?: any, appSettings?: AppSettings) => {
      const featureTypeName =
        initialState?.featureTypeName ?? ScaleFeature.typeName;
      return new ConfigurableFeatureView(
        { ...initialState, categoryName: "Instrument", featureTypeName },
        appSettings!,
      );
    },
  } as FretboardFloatingViewDescriptor);

  registerFloatingView({
    viewId: "instrument_chord",
    displayName: "Chord",
    icon: "grid_on",
    featureTypeName: ChordFeature.typeName,
    refreshOnInstrumentChange: true,
    defaultWidth: 420,
    defaultHeight: 550,
    showInMenu: false,
    supportsConfigToggle: true,
    isFretboardView: true,
    supportsRotate: true,
    supportsZoom: true,
    createView: (initialState?: any, appSettings?: AppSettings) => {
      const featureTypeName =
        initialState?.featureTypeName ?? ChordFeature.typeName;
      return new ConfigurableFeatureView(
        { ...initialState, categoryName: "Instrument", featureTypeName },
        appSettings!,
      );
    },
  } as FretboardFloatingViewDescriptor);

  registerFloatingView({
    viewId: "instrument_triad",
    displayName: "Triad Shapes",
    icon: "change_history",
    featureTypeName: TriadFeature.typeName,
    refreshOnInstrumentChange: true,
    defaultWidth: 420,
    defaultHeight: 600,
    showInMenu: false,
    supportsConfigToggle: true,
    isFretboardView: true,
    supportsRotate: true,
    supportsZoom: true,
    createView: (initialState?: any, appSettings?: AppSettings) => {
      const featureTypeName =
        initialState?.featureTypeName ?? TriadFeature.typeName;
      return new ConfigurableFeatureView(
        { ...initialState, categoryName: "Instrument", featureTypeName },
        appSettings!,
      );
    },
  } as FretboardFloatingViewDescriptor);

  registerFloatingView({
    viewId: "instrument_nearby_triads",
    displayName: "Nearby Triads",
    icon: "swap_horiz",
    featureTypeName: NearbyTriadsFeature.typeName,
    refreshOnInstrumentChange: true,
    defaultWidth: 740,
    defaultHeight: 520,
    showInMenu: false,
    supportsConfigToggle: true,
    isFretboardView: true,
    supportsRotate: true,
    supportsZoom: true,
    createView: (initialState?: any, appSettings?: AppSettings) => {
      const featureTypeName =
        initialState?.featureTypeName ?? NearbyTriadsFeature.typeName;
      return new ConfigurableFeatureView(
        { ...initialState, categoryName: "Instrument", featureTypeName },
        appSettings!,
      );
    },
  } as FretboardFloatingViewDescriptor);

  registerFloatingView({
    viewId: "instrument_arpeggio",
    displayName: "Arpeggio",
    icon: "linear_scale",
    featureTypeName: ArpeggioFeature.typeName,
    refreshOnInstrumentChange: true,
    defaultWidth: 420,
    defaultHeight: 550,
    showInMenu: false,
    supportsConfigToggle: true,
    isFretboardView: true,
    supportsRotate: true,
    supportsZoom: true,
    createView: (initialState?: any, appSettings?: AppSettings) => {
      const featureTypeName =
        initialState?.featureTypeName ?? ArpeggioFeature.typeName;
      return new ConfigurableFeatureView(
        { ...initialState, categoryName: "Instrument", featureTypeName },
        appSettings!,
      );
    },
  } as FretboardFloatingViewDescriptor);

  registerFloatingView({
    viewId: "instrument_caged",
    displayName: "CAGED",
    icon: "grid_view",
    featureTypeName: CagedFeature.typeName,
    refreshOnInstrumentChange: true,
    defaultWidth: 420,
    defaultHeight: 550,
    showInMenu: false,
    supportsConfigToggle: true,
    isFretboardView: true,
    supportsRotate: true,
    supportsZoom: true,
    createView: (initialState?: any, appSettings?: AppSettings) => {
      const featureTypeName =
        initialState?.featureTypeName ?? CagedFeature.typeName;
      return new ConfigurableFeatureView(
        { ...initialState, categoryName: "Instrument", featureTypeName },
        appSettings!,
      );
    },
  } as FretboardFloatingViewDescriptor);

  registerFloatingView({
    viewId: "instrument_multifret",
    displayName: "MultiFret",
    icon: "layers",
    featureTypeName: MultiLayerFretboardFeature.typeName,
    refreshOnInstrumentChange: true,
    defaultWidth: 420,
    defaultHeight: 550,
    showInMenu: false,
    supportsConfigToggle: true,
    isFretboardView: true,
    supportsRotate: true,
    supportsZoom: true,
    createView: (initialState?: any, appSettings?: AppSettings) => {
      const featureTypeName =
        initialState?.featureTypeName ?? MultiLayerFretboardFeature.typeName;
      return new ConfigurableFeatureView(
        { ...initialState, categoryName: "Instrument", featureTypeName },
        appSettings!,
      );
    },
  } as FretboardFloatingViewDescriptor);

  registerFloatingView({
    viewId: "instrument_notes_reference",
    displayName: "Fretboard Notes",
    icon: "music_note",
    refreshOnInstrumentChange: true,
    defaultWidth: 340,
    defaultHeight: 550,
    showInMenu: true,
    isFretboardView: true,
    supportsRotate: true,
    supportsZoom: true,
    createView: (initialState?: any, appSettings?: AppSettings) => {
      const feature = NotesFeature.createFeature(
        ["None"],
        undefined,
        appSettings,
        new InstrumentIntervalSettings(),
        650,
        "Instrument",
      );
      return {
        render: (container: HTMLElement) => {
          feature.render(container);
          if (feature.views) {
            feature.views.forEach((v) => v.render(container));
          }
        },
        start: () => feature.start?.(),
        stop: () => feature.stop?.(),
        destroy: () => feature.destroy?.(),
      };
    },
  } as FretboardFloatingViewDescriptor);

  registerFloatingView({
    viewId: "instrument_chord_progression",
    displayName: "Chord Progression",
    icon: "arrow_forward",
    featureTypeName: ChordProgressionFeature.typeName,
    refreshOnInstrumentChange: true,
    defaultWidth: 420,
    defaultHeight: 600,
    showInMenu: true,
    supportsConfigToggle: true,
    isFretboardView: true,
    supportsRotate: true,
    supportsZoom: true,
    createView: (initialState?: any, appSettings?: AppSettings) =>
      new ConfigurableFeatureView(
        {
          ...initialState,
          categoryName: "Instrument",
          featureTypeName: ChordProgressionFeature.typeName,
        },
        appSettings!,
      ),
  } as FretboardFloatingViewDescriptor);

  registerFloatingView({
    viewId: "instrument_floating_metronome",
    displayName: "Metronome",
    icon: "timer",
    refreshOnInstrumentChange: true,
    defaultWidth: 280,
    defaultHeight: 120,
    createView: () => {
      const audioController = new AudioController(
        document.querySelector("#intro-end-sound") as HTMLAudioElement,
        document.querySelector("#interval-end-sound") as HTMLAudioElement,
        document.querySelector("#metronome-sound") as HTMLAudioElement,
        document.querySelector("#metronome-accent-sound") as HTMLAudioElement,
      );
      return new MetronomeView(120, audioController);
    },
  });

  registerFloatingView({
    viewId: "circle_of_fifths",
    displayName: "Circle of Fifths",
    icon: "donut_large",
    defaultWidth: 360,
    minWidth: 290,
    minHeight: 430,
    createView: (initialState?: any) => new CircleOfFifthsView(initialState),
  });

  registerFloatingView({
    viewId: GLOBAL_KEY_VIEW_ID,
    displayName: "Global Key",
    icon: "cell_tower",
    defaultWidth: 300,
    defaultHeight: 55,
    minWidth: 240,
    minHeight: 60,
    singleton: true,
    createView: (initialState?: any) => new GlobalKeyView(initialState),
  });

  registerFloatingView({
    viewId: "strum_view",
    displayName: "Strum",
    icon: "music_note",
    defaultWidth: 520,
    defaultHeight: 160,
    createView: (initialState?: any) => {
      const audioController = new AudioController(
        document.querySelector("#intro-end-sound") as HTMLAudioElement,
        document.querySelector("#interval-end-sound") as HTMLAudioElement,
        document.querySelector("#metronome-sound") as HTMLAudioElement,
        document.querySelector("#metronome-accent-sound") as HTMLAudioElement,
      );
      return new StrumView(initialState, audioController);
    },
  });
}
