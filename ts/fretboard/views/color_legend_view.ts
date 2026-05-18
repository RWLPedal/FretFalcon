import { BaseView } from "../../base_view";
import { AppSettings } from "../../settings";
import {
  InstrumentSettings,
  DEFAULT_INSTRUMENT_SETTINGS,
} from "../instrument_settings";
import { INTERVAL_COLORS, NOTE_COLORS } from "../colors"; // Import color maps

export class ColorLegendView extends BaseView {
  private appSettings: AppSettings;

  constructor(appSettings?: AppSettings) {
    super();
    if (!appSettings) {
      throw new Error("ColorLegendView requires AppSettings instance.");
    }
    this.appSettings = appSettings;
  }

  render(container: HTMLElement): void {
    this.container = container;
    this.container.innerHTML = ""; // Clear previous content
    this.container.classList.add("color-legend-view"); // For styling

    const guitarSettings = this.appSettings.instrumentSettings ?? DEFAULT_INSTRUMENT_SETTINGS;
    const currentScheme = guitarSettings.colorScheme;

    let colorMap: { [key: string]: string } = {};
    let title = "Color Legend";

    if (currentScheme === "interval") {
      colorMap = INTERVAL_COLORS;
      title = "Interval Color Legend";
    } else if (currentScheme === "note") {
      colorMap = NOTE_COLORS;
      title = "Note Color Legend";
      // Filter out aliases for display? (Optional)
      const primaryNoteMap: { [key: string]: string } = {};
      Object.entries(NOTE_COLORS).forEach(([key, value]) => {
        if (!key.includes("b") || key.length === 2) {
          // Basic filter for primary names (A, A#, B, C...)
          if (key !== "DEFAULT") primaryNoteMap[key] = value;
        }
      });
      colorMap = primaryNoteMap;
    } else {
      // Simplified or others
      colorMap = { R: INTERVAL_COLORS["R"], Other: INTERVAL_COLORS["DEFAULT"] };
      title = "Simplified Color Legend";
    }

    // Create legend items
    for (const key in colorMap) {
      if (key === "DEFAULT") continue; // Skip default entry

      const item = document.createElement("div");
      item.classList.add("legend-item");

      const swatch = document.createElement("span");
      swatch.classList.add("color-swatch");
      swatch.style.backgroundColor = colorMap[key];

      const label = document.createElement("span");
      label.classList.add("legend-label");
      label.textContent = key;

      item.appendChild(swatch);
      item.appendChild(label);
      this.container.appendChild(item);
    }
  }

  destroy(): void {
    if (this.container) {
      this.container.innerHTML = "";
    }
    super.destroy();
  }
}
