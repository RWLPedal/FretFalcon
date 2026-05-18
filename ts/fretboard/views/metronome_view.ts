// ts/instrument/views/metronome_view.ts
import { BaseView } from "../../base_view";
import { AudioController } from "../../audio_controller";
import { SignalKind, TempoSignal } from "../../floating_views/link_types";

enum BeatState {
  Silent = 0,
  Normal = 1,
  Accent = 2,
}

interface TimeSignature {
  beats: number;
  subdivision: number;
  label: string;
}

const COMMON_TIME_SIGNATURES: TimeSignature[] = [
  { beats: 4, subdivision: 4, label: "4/4" },
  { beats: 3, subdivision: 4, label: "3/4" },
  { beats: 2, subdivision: 4, label: "2/4" },
  { beats: 6, subdivision: 8, label: "6/8" },
  { beats: 5, subdivision: 4, label: "5/4" },
  { beats: 7, subdivision: 8, label: "7/8" },
];

export class MetronomeView extends BaseView {
  private bpm: number;
  private intervalId: number | null = null;
  private audioController: AudioController;

  public isRunning: boolean = false;
  private currentTimeSignature: TimeSignature = COMMON_TIME_SIGNATURES[0];
  private currentSubdivisionLevel = 8;
  private numberOfVisualBeats: number = 8;
  private beatStates: BeatState[] = [];
  private currentTickIndex: number = -1;
  private isMuted: boolean = false;

  // BPM progression
  private progressionDelta: number = 0;
  private progressionSecs: number = 0;
  private progressionTimerId: number | null = null;

  // Tempo driver/target
  private isTempoTarget: boolean = false;
  private _suppressTempoEvent: boolean = false;

  // UI Elements
  private viewWrapper: HTMLElement | null = null;
  private beatsContainer: HTMLElement | null = null;
  private beatElements: HTMLElement[] = [];
  private timeSigSelect: HTMLSelectElement | null = null;
  private bpmSlider: HTMLInputElement | null = null;
  private bpmDisplay: HTMLSpanElement | null = null;
  private playPauseButton: HTMLButtonElement | null = null;
  private muteButton: HTMLButtonElement | null = null;
  private progressionDeltaInput: HTMLInputElement | null = null;
  private progressionSecsInput: HTMLInputElement | null = null;

  constructor(bpm: number, audioController: AudioController) {
    super();
    this.bpm = bpm > 0 ? bpm : 60;
    this.audioController = audioController;
    this.updateNumberOfVisualBeats();
    this.initializeBeatStates();
  }

  private updateNumberOfVisualBeats(): void {
    if (this.currentTimeSignature.subdivision === 8) {
      this.numberOfVisualBeats = this.currentTimeSignature.beats;
    } else {
      this.numberOfVisualBeats = this.currentTimeSignature.beats * 2;
    }
    if (this.beatStates.length !== this.numberOfVisualBeats) {
      this.initializeBeatStates();
    }
  }

  private initializeBeatStates(): void {
    this.beatStates = new Array(this.numberOfVisualBeats);
    const step = this.currentSubdivisionLevel / this.currentTimeSignature.subdivision;
    for (let i = 0; i < this.numberOfVisualBeats; i++) {
      if (i % step === 0) {
        this.beatStates[i] = i === 0 ? BeatState.Accent : BeatState.Normal;
      } else {
        this.beatStates[i] = BeatState.Silent;
      }
    }
    if (this.beatStates.length > 0 && this.beatStates[0] !== BeatState.Accent) {
      this.beatStates[0] = BeatState.Accent;
    }
  }

  render(container: HTMLElement): void {
    this.container = container;
    this.cleanupVisuals();

    this.viewWrapper = document.createElement("div");
    this.viewWrapper.classList.add("metronome-view");

    // Beat visualizer
    this.beatsContainer = document.createElement("div");
    this.beatsContainer.classList.add("metronome-beats-container");
    this.rebuildVisualizer();
    this.viewWrapper.appendChild(this.beatsContainer);

    // Row 2: transport — time sig, play/pause, mute
    const transportRow = document.createElement("div");
    transportRow.classList.add("metronome-transport-row");

    const timeSigWrapper = document.createElement("div");
    timeSigWrapper.classList.add("select", "is-small");
    this.timeSigSelect = document.createElement("select");
    this.timeSigSelect.classList.add("metronome-time-signature-selector");
    this.timeSigSelect.setAttribute("aria-label", "Time Signature");
    COMMON_TIME_SIGNATURES.forEach((sig) => {
      const option = new Option(sig.label, sig.label);
      if (sig.label === this.currentTimeSignature.label) option.selected = true;
      this.timeSigSelect!.appendChild(option);
    });
    this.timeSigSelect.addEventListener("change", this.handleTimeSigChange.bind(this));
    timeSigWrapper.appendChild(this.timeSigSelect);
    transportRow.appendChild(timeSigWrapper);

    this.playPauseButton = document.createElement("button");
    this.playPauseButton.type = "button";
    this.playPauseButton.classList.add("button", "is-small", "play-pause-btn");
    this.playPauseButton.innerHTML = `<span class="material-icons">play_arrow</span>`;
    this.playPauseButton.title = "Play/Pause Metronome";
    this.playPauseButton.addEventListener("click", () => {
      if (this.isRunning) this.stop();
      else this.start();
    });
    transportRow.appendChild(this.playPauseButton);

    this.muteButton = document.createElement("button");
    this.muteButton.type = "button";
    this.muteButton.classList.add("button", "is-small", "metronome-mute-btn");
    this.muteButton.innerHTML = `<span class="material-icons">volume_up</span>`;
    this.muteButton.addEventListener("click", this.toggleMute.bind(this));
    transportRow.appendChild(this.muteButton);

    this.viewWrapper.appendChild(transportRow);

    // Row 3: BPM display, slider, progression inputs
    const bpmRow = document.createElement("div");
    bpmRow.classList.add("metronome-bpm-row");

    this.bpmDisplay = document.createElement("span");
    this.bpmDisplay.classList.add("metronome-bpm-display", "is-size-7");
    bpmRow.appendChild(this.bpmDisplay);

    this.bpmSlider = document.createElement("input");
    this.bpmSlider.type = "range";
    this.bpmSlider.min = "20";
    this.bpmSlider.max = "240";
    this.bpmSlider.value = String(this.bpm);
    this.bpmSlider.classList.add("metronome-bpm-slider");
    this.bpmSlider.addEventListener("input", this.handleSliderInput.bind(this));
    bpmRow.appendChild(this.bpmSlider);

    // Progression inputs
    this.progressionDeltaInput = document.createElement("input");
    this.progressionDeltaInput.type = "number";
    this.progressionDeltaInput.value = "0";
    this.progressionDeltaInput.classList.add("metronome-progression-input");
    this.progressionDeltaInput.title = "BPM change per interval (negative = decrease)";
    this.progressionDeltaInput.addEventListener("change", this.handleProgressionChange.bind(this));
    bpmRow.appendChild(this.progressionDeltaInput);

    const bpmProgLabel = document.createElement("span");
    bpmProgLabel.classList.add("metronome-progression-label");
    bpmProgLabel.textContent = "BPM /";
    bpmRow.appendChild(bpmProgLabel);

    this.progressionSecsInput = document.createElement("input");
    this.progressionSecsInput.type = "number";
    this.progressionSecsInput.value = "0";
    this.progressionSecsInput.min = "0";
    this.progressionSecsInput.classList.add("metronome-progression-input");
    this.progressionSecsInput.title = "Time interval in seconds";
    this.progressionSecsInput.addEventListener("change", this.handleProgressionChange.bind(this));
    bpmRow.appendChild(this.progressionSecsInput);

    const secLabel = document.createElement("span");
    secLabel.classList.add("metronome-progression-label");
    secLabel.textContent = "sec";
    bpmRow.appendChild(secLabel);

    this.viewWrapper.appendChild(bpmRow);
    this.container.appendChild(this.viewWrapper);

    this.updateBpmDisplay();
    this.updateMuteButtonState();
    this.updatePlayPauseButtonState();
    this.updateAllBeatStyles();
    this.applyTargetDisabledState();

    this.listen(container, "drive-signal", (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const signal = detail?.signal;
      if (!signal || signal.kind !== SignalKind.Tempo) return;
      const tempo = signal as TempoSignal;
      this._suppressTempoEvent = true;
      this.setBpm(tempo.bpm);
      this._suppressTempoEvent = false;
    });
    this.listen(container, "link-status-changed", (e: Event) => {
      const detail = (e as CustomEvent).detail;
      this.isTempoTarget = !!(detail?.hasIncomingLinks);
      this.applyTargetDisabledState();
    });
  }

  private rebuildVisualizer(): void {
    if (!this.beatsContainer) return;
    this.beatsContainer.innerHTML = "";
    this.beatElements = [];
    const step = this.currentSubdivisionLevel / this.currentTimeSignature.subdivision;

    for (let i = 0; i < this.numberOfVisualBeats; i++) {
      const beatEl = document.createElement("div");
      beatEl.classList.add("metronome-beat");
      beatEl.dataset.index = String(i);
      if (i % step === 0) beatEl.classList.add("beat-downbeat");
      else beatEl.classList.add("beat-subdivision");
      beatEl.addEventListener("click", this.handleBeatClick.bind(this));
      this.beatElements.push(beatEl);
      this.beatsContainer!.appendChild(beatEl);
    }
    this.updateAllBeatStyles();
  }

  private handleTimeSigChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const newSig = COMMON_TIME_SIGNATURES.find((sig) => sig.label === select.value);
    if (newSig && newSig.label !== this.currentTimeSignature.label) {
      this.currentTimeSignature = newSig;
      this.stopInterval();
      this.updateNumberOfVisualBeats();
      this.rebuildVisualizer();
      this.currentTickIndex = -1;
      if (this.isRunning) this.startInterval();
    }
  }

  start(): void {
    if (!this.isRunning) {
      this.isRunning = true;
      this.startInterval();
      this.startProgressionTimer();
    }
    this.updateMuteButtonState();
    this.updatePlayPauseButtonState();
    this.dispatchTempoEvent();
  }

  stop(): void {
    if (this.isRunning) {
      this.isRunning = false;
      this.stopInterval();
      this.stopProgressionTimer();
    }
    this.updateMuteButtonState();
    this.updatePlayPauseButtonState();
  }

  destroy(): void {
    this.stopInterval();
    this.stopProgressionTimer();
    this.cleanupVisuals();
    super.destroy();
  }

  setBpm(newBpm: number): void {
    const clamped = Math.max(20, Math.min(240, Math.round(newBpm)));
    const changed = this.bpm !== clamped;
    this.bpm = clamped;
    this.updateBpmDisplay();
    if (this.bpmSlider) this.bpmSlider.value = String(clamped);
    if (changed && this.isRunning) {
      this.stopInterval();
      this.startInterval();
    }
    if (changed && !this._suppressTempoEvent) {
      this.dispatchTempoEvent();
    }
  }

  private dispatchTempoEvent(): void {
    if (!this.container) return;
    this.container.dispatchEvent(new CustomEvent("metronome-tempo-changed", {
      bubbles: true,
      detail: { bpm: this.bpm },
    }));
  }

  // ─── Progression ────────────────────────────────────────────────────────────

  private handleProgressionChange(): void {
    this.progressionDelta = parseFloat(this.progressionDeltaInput?.value ?? "0") || 0;
    this.progressionSecs  = parseFloat(this.progressionSecsInput?.value  ?? "0") || 0;
    if (this.progressionSecsInput && this.progressionSecs < 0) {
      this.progressionSecs = 0;
      this.progressionSecsInput.value = "0";
    }
    this.stopProgressionTimer();
    if (this.isRunning) this.startProgressionTimer();
  }

  private startProgressionTimer(): void {
    if (this.progressionDelta === 0 || this.progressionSecs <= 0) return;
    this.progressionTimerId = window.setInterval(() => {
      this.setBpm(this.bpm + this.progressionDelta);
    }, this.progressionSecs * 1000);
  }

  private stopProgressionTimer(): void {
    if (this.progressionTimerId !== null) {
      clearInterval(this.progressionTimerId);
      this.progressionTimerId = null;
    }
  }

  // ─── Target disabled state ───────────────────────────────────────────────────

  private applyTargetDisabledState(): void {
    const disabled = this.isTempoTarget;
    if (this.bpmSlider) this.bpmSlider.disabled = disabled;
    if (this.progressionDeltaInput) this.progressionDeltaInput.disabled = disabled;
    if (this.progressionSecsInput) this.progressionSecsInput.disabled = disabled;
  }

  // ─── Interval ───────────────────────────────────────────────────────────────

  private startInterval(): void {
    if (this.intervalId !== null || this.bpm <= 0) return;
    const ticksPerBeat = this.currentSubdivisionLevel / this.currentTimeSignature.subdivision;
    const intervalMillis = (60 / this.bpm / ticksPerBeat) * 1000;
    this.intervalId = window.setInterval(() => this.tick(), intervalMillis);
  }

  private stopInterval(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
      this.resetCurrentBeatStyle();
    }
  }

  private tick(): void {
    this.resetCurrentBeatStyle();
    this.currentTickIndex = (this.currentTickIndex + 1) % this.numberOfVisualBeats;
    const currentEl = this.beatElements[this.currentTickIndex];
    if (currentEl) currentEl.classList.add("beat-current");
    const state = this.beatStates[this.currentTickIndex];
    if (!this.isMuted) {
      if (state === BeatState.Accent) this.audioController.playAccentMetronomeClick();
      else if (state === BeatState.Normal) this.audioController.playMetronomeClick();
    }
  }

  private resetCurrentBeatStyle(): void {
    if (this.currentTickIndex >= 0 && this.beatElements[this.currentTickIndex]) {
      this.beatElements[this.currentTickIndex].classList.remove("beat-current");
    }
  }

  // ─── Mute ────────────────────────────────────────────────────────────────────

  private toggleMute(): void {
    this.isMuted = !this.isMuted;
    this.updateMuteButtonState();
  }

  private updateMuteButtonState(): void {
    if (!this.muteButton) return;
    this.muteButton.innerHTML = this.isMuted
      ? `<span class="material-icons">volume_off</span>`
      : `<span class="material-icons">volume_up</span>`;
    this.muteButton.classList.toggle("is-warning", this.isMuted);
  }

  // ─── UI updates ──────────────────────────────────────────────────────────────

  private updatePlayPauseButtonState(): void {
    if (!this.playPauseButton) return;
    if (this.isRunning) {
      this.playPauseButton.innerHTML = `<span class="material-icons">pause</span>`;
      this.playPauseButton.title = "Pause Metronome";
    } else {
      this.playPauseButton.innerHTML = `<span class="material-icons">play_arrow</span>`;
      this.playPauseButton.title = "Play Metronome";
    }
  }

  private updateBpmDisplay(): void {
    if (this.bpmDisplay) this.bpmDisplay.textContent = String(this.bpm);
  }

  private updateAllBeatStyles(): void {
    this.beatElements.forEach((el, i) => this.applyBeatStyle(el, i));
  }

  private applyBeatStyle(element: HTMLElement, index: number): void {
    element.classList.remove("beat-normal", "beat-accent", "beat-silent", "beat-current");
    switch (this.beatStates[index]) {
      case BeatState.Accent: element.classList.add("beat-accent"); break;
      case BeatState.Silent: element.classList.add("beat-silent"); break;
      default:               element.classList.add("beat-normal"); break;
    }
    if (index === this.currentTickIndex) element.classList.add("beat-current");
  }

  private handleSliderInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.setBpm(parseInt(target.value, 10));
  }

  private handleBeatClick(event: MouseEvent): void {
    const target = event.currentTarget as HTMLElement;
    const indexStr = target.dataset.index;
    if (indexStr === undefined) return;
    const index = parseInt(indexStr, 10);
    if (isNaN(index) || index < 0 || index >= this.numberOfVisualBeats) return;

    const current = this.beatStates[index];
    let next: BeatState;
    if (current === BeatState.Normal) next = BeatState.Accent;
    else if (current === BeatState.Accent) next = BeatState.Silent;
    else next = BeatState.Normal;

    this.beatStates[index] = next;
    this.applyBeatStyle(target, index);
  }

  private cleanupVisuals(): void {
    if (this.viewWrapper?.parentNode) {
      this.viewWrapper.parentNode.removeChild(this.viewWrapper);
    }
    this.viewWrapper = null;
    this.beatsContainer = null;
    this.beatElements = [];
    this.timeSigSelect = null;
    this.bpmSlider = null;
    this.bpmDisplay = null;
    this.muteButton = null;
    this.playPauseButton = null;
    this.progressionDeltaInput = null;
    this.progressionSecsInput = null;
  }
}
