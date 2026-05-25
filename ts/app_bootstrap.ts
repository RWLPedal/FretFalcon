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
import { NotesFeature } from "./fretboard/features/notes_feature";
import { ChordProgressionFeature } from "./fretboard/features/chord_progression_feature";
import { InstrumentIntervalSettings } from "./fretboard/fretboard_interval_settings";
import { AudioController } from "./audio_controller";
import { AppSettings } from "./settings";

export function registerBuiltins(): void {
  registerCategory(instrumentCategory);

  registerFloatingView({
    viewId: "floating_timer",
    displayName: "Timer",
    categoryName: "General",
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
    categoryName: "General",
    defaultWidth: 175,
    defaultHeight: 80,
    createView: (initialState?: any) => new DroneView(initialState),
  });

  registerFloatingView({
    viewId: "schedule_floating_view",
    displayName: "Schedule",
    categoryName: "Practice",
    defaultWidth: 960,
    defaultHeight: 800,
    showInMenu: false,
    createView: (initialState?: any, appSettings?: AppSettings) =>
      new ScheduleFloatingView(initialState, appSettings!),
  });

  registerFloatingView({
    viewId: "any_floating_view",
    displayName: "Any",
    categoryName: "Practice",
    defaultWidth: 420,
    defaultHeight: 550,
    showInMenu: false,
    createView: (initialState?: any, appSettings?: AppSettings) =>
      new AnyFloatingView(initialState, appSettings!),
  });

  registerFloatingView({
    viewId: "any_feature",
    displayName: "Any Feature",
    categoryName: "Practice",
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
    categoryName: "General",
    defaultWidth: 575,
    defaultHeight: 300,
    minWidth: 575,
    minHeight: 300,
    createView: (initialState?: any) => new BackingTrackView(initialState),
  });

  registerFloatingView({
    viewId: "capo_view",
    displayName: "Capo",
    categoryName: "General",
    defaultWidth: 240,
    defaultHeight: 350,
    createView: (_initialState?: any, appSettings?: AppSettings) =>
      new CapoView(appSettings!),
  });

  registerFloatingView({
    viewId: "instrument_color_legend",
    displayName: "Color Legend",
    categoryName: "Instrument",
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
    categoryName: "Instrument",
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
    viewId: "instrument_notes_reference",
    displayName: "Fretboard Notes",
    categoryName: "Instrument",
    defaultWidth: 340,
    defaultHeight: 550,
    showInMenu: true,
    isFretboardView: true,
    supportsRotate: true,
    supportsZoom: true,
    createView: (initialState?: any, appSettings?: AppSettings) => {
      // No audio output — AudioController is required by the feature API but unused here.
      const audio = new AudioController(null, null, null, null);
      const feature = NotesFeature.createFeature(
        ["None"],
        audio,
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
    categoryName: "Instrument",
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
    categoryName: "Instrument",
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
    categoryName: "Theory",
    defaultWidth: 360,
    minWidth: 290,
    minHeight: 430,
    createView: (initialState?: any) => new CircleOfFifthsView(initialState),
  });

  registerFloatingView({
    viewId: "strum_view",
    displayName: "Strum",
    categoryName: "Practice",
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
