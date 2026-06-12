// ts/fretboard/features/layer_list_ui.ts
// Layer list UI component for MultiLayerFretboard feature configuration.

import { ConfigurationSchemaArg } from "../../feature";
import { LayerType } from "./layer_types";

// --- Types ---

interface ChordEntry { key: string; label: string; }

interface LayerListComponentData {
  scaleNames?: string[];
  rootNoteOptions?: string[];
  chordEntries?: ChordEntry[];
  noteNames?: string[];
}

type UiLayerType = Exclude<LayerType, LayerType.Caged>;

const LAYER_TYPE_LABELS: Record<UiLayerType, string> = {
  [LayerType.Scale]: "Scale",
  [LayerType.Chord]: "Chord Tones",
  [LayerType.Notes]: "Notes",
};

const LAYER_DEFAULT_COLOR_VARS: Record<UiLayerType, string> = {
  [LayerType.Scale]: 'var(--dm-palette-3)',
  [LayerType.Chord]: 'var(--dm-palette-2)',
  [LayerType.Notes]: 'var(--dm-palette-1)',
};

const PALETTE_VARS = [
  'var(--dm-palette-1)',
  'var(--dm-palette-2)',
  'var(--dm-palette-3)',
  'var(--dm-palette-4)',
  'var(--dm-palette-5)',
  'var(--dm-palette-6)',
  'var(--dm-palette-7)',
];

function getDefaultLayerColor(type: UiLayerType): string {
  return LAYER_DEFAULT_COLOR_VARS[type];
}

// --- Presets ---

type PresetDefinition = {
  label: string;
  /** Full encoded layer strings (with colors) to populate the rows. */
  layers: string[];
  /** Type + key-field signature for matching current rows to a preset. */
  signature: string[];
};

const PRESETS: PresetDefinition[] = [
  {
    label: "Scale",
    layers: ["scale|driven|driven|var(--dm-palette-3)|none"],
    signature: ["scale|driven|driven"],
  },
  {
    label: "Chord",
    layers: ["chord|driven|var(--dm-palette-2)|none"],
    signature: ["chord|driven"],
  },
  {
    label: "Scale + Chord",
    layers: [
      "chord|driven|var(--dm-palette-2)|none",
      "scale|driven|driven|var(--dm-palette-3)|none",
    ],
    signature: ["chord|driven", "scale|driven|driven"],
  },
  {
    label: "Scale + Chord + Next",
    layers: [
      "chord|driven_next|var(--dm-palette-1)|none",
      "chord|driven|var(--dm-palette-2)|none",
      "scale|driven|driven|var(--dm-palette-3)|none",
    ],
    signature: ["chord|driven_next", "chord|driven", "scale|driven|driven"],
  },
];

function layerSignature(encoded: string): string {
  const parts = encoded.split('|');
  if (parts[0] === 'scale' && parts.length >= 3) return `scale|${parts[1]}|${parts[2]}`;
  if (parts[0] === 'chord' && parts.length >= 2) return `chord|${parts[1]}`;
  if (parts[0] === 'notes' && parts.length >= 2) return `notes|${parts[1]}`;
  return encoded;
}

// --- Color Picker ---

function createPaletteColorPicker(initialColor: string, role: 'fill' | 'stroke', onChange?: () => void): HTMLElement {
  function applyColorStyle(el: HTMLElement, colorVar: string): void {
    if (colorVar === 'none') {
      el.style.background = '';
      el.style.boxShadow = '';
      el.classList.add("swatch-none");
    } else if (role === 'stroke') {
      el.style.background = 'transparent';
      el.style.boxShadow = `inset 0 0 0 2.5px ${colorVar}`;
      el.classList.remove("swatch-none");
    } else {
      el.style.background = colorVar;
      el.style.boxShadow = '';
      el.classList.remove("swatch-none");
    }
  }

  const wrap = document.createElement("div");
  wrap.classList.add("layer-palette-picker-wrap");

  const btn = document.createElement("button");
  btn.type = "button";
  btn.classList.add("layer-palette-btn");
  btn.title = role === 'fill' ? "Fill color" : "Stroke color";
  btn.dataset.colorVar = initialColor;
  btn.dataset.pickerRole = role;

  const preview = document.createElement("span");
  preview.classList.add("layer-palette-swatch-preview");
  applyColorStyle(preview, initialColor);
  btn.appendChild(preview);
  wrap.appendChild(btn);

  // Portalled into body so it's never clipped by overflow or canvas stacking contexts.
  const popover = document.createElement("div");
  popover.classList.add("layer-palette-popover");
  popover.hidden = true;
  document.body.appendChild(popover);

  function addSwatch(varStr: string, isNone: boolean): void {
    const paletteBtn = document.createElement("button");
    paletteBtn.type = "button";
    paletteBtn.classList.add("palette-swatch");
    paletteBtn.dataset.var = varStr;
    if (isNone) {
      paletteBtn.classList.add("palette-swatch-none");
      paletteBtn.title = "None (transparent)";
    } else {
      applyColorStyle(paletteBtn, varStr);
      paletteBtn.title = varStr;
    }
    if (varStr === initialColor) paletteBtn.classList.add("is-active");
    paletteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      btn.dataset.colorVar = varStr;
      applyColorStyle(preview, varStr);
      popover.querySelectorAll<HTMLElement>(".palette-swatch").forEach(s =>
        s.classList.toggle("is-active", s.dataset.var === varStr)
      );
      popover.hidden = true;
      onChange?.();
    });
    popover.appendChild(paletteBtn);
  }

  addSwatch('none', true);
  PALETTE_VARS.forEach((varStr) => addSwatch(varStr, false));

  function openPopover(): void {
    document.querySelectorAll<HTMLElement>(".layer-palette-popover:not([hidden])").forEach(p => {
      if (p !== popover) p.hidden = true;
    });
    const rect = btn.getBoundingClientRect();
    popover.style.position = "fixed";
    popover.style.top = `${rect.bottom + 4}px`;
    popover.style.left = `${rect.left + rect.width / 2}px`;
    popover.style.transform = "translateX(-50%)";
    popover.hidden = false;
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!popover.hidden) {
      popover.hidden = true;
    } else {
      openPopover();
    }
  });

  document.addEventListener("click", () => { popover.hidden = true; });

  new MutationObserver(() => {
    if (!wrap.isConnected) popover.remove();
  }).observe(document.body, { childList: true, subtree: true });

  (wrap as any)._setColor = (color: string) => {
    btn.dataset.colorVar = color;
    applyColorStyle(preview, color);
    popover.querySelectorAll<HTMLElement>(".palette-swatch").forEach(s =>
      s.classList.toggle("is-active", s.dataset.var === color)
    );
  };

  return wrap;
}

// --- Layer Fields ---

function parseLayerStringForUI(
  layerStr: string
): { type: LayerType; fields: string[]; fillColor: string; strokeColor: string } | null {
  const parts = layerStr.split("|");
  if (parts.length < 2) return null;
  const type = parts[0] as LayerType;
  if (parts.length < 3) return null;
  if (type === "scale" && parts.length >= 4) {
    return { type, fields: [parts[1], parts[2]], fillColor: parts[3], strokeColor: parts[4] ?? 'none' };
  } else if (type === "chord" && parts.length >= 3) {
    return { type, fields: [parts[1]], fillColor: parts[2], strokeColor: parts[3] ?? 'none' };
  } else if (type === "notes" && parts.length >= 3) {
    return { type, fields: [parts[1]], fillColor: parts[2], strokeColor: parts[3] ?? 'none' };
  }
  return null;
}

function buildLayerFields(
  fieldsContainer: HTMLElement,
  layerType: LayerType,
  data: LayerListComponentData,
  initialFields: string[],
  onChange?: () => void
): void {
  fieldsContainer.innerHTML = "";

  if (layerType === "scale") {
    const scaleNames = data.scaleNames ?? [];
    const scaleWrapper = document.createElement("div");
    scaleWrapper.classList.add("select", "is-small", "is-fullwidth");
    scaleWrapper.style.flex = "1";
    scaleWrapper.style.minWidth = "0";
    scaleWrapper.style.maxWidth = "200px";
    const scaleSelect = document.createElement("select");
    scaleSelect.dataset.field = "scaleName";
    const isDrivenScaleName = initialFields[0] === "driven" || initialFields[0] === "driven_next";
    if (isDrivenScaleName) {
      const drivenOpt = document.createElement("option");
      drivenOpt.value = initialFields[0];
      drivenOpt.text = initialFields[0] === "driven_next" ? "⟳ Driven (Next)" : "⟳ Driven";
      drivenOpt.style.fontStyle = "italic";
      scaleSelect.appendChild(drivenOpt);
    }
    scaleNames.forEach((name) => {
      const opt = new Option(name, name);
      if (name === (initialFields[0] ?? "") && !isDrivenScaleName) opt.selected = true;
      scaleSelect.appendChild(opt);
    });
    if (isDrivenScaleName) scaleSelect.value = initialFields[0];
    scaleSelect.addEventListener("change", () => onChange?.());
    scaleWrapper.appendChild(scaleSelect);
    fieldsContainer.appendChild(scaleWrapper);

    const rootNotes = data.rootNoteOptions ?? [];
    const rootWrapper = document.createElement("div");
    rootWrapper.classList.add("select", "is-small");
    rootWrapper.style.flexShrink = "0";
    rootWrapper.style.width = "80px";
    const rootSelect = document.createElement("select");
    rootSelect.dataset.field = "rootNote";
    const isDrivenRootNote = initialFields[1] === "driven" || initialFields[1] === "driven_next";
    if (isDrivenRootNote) {
      const drivenOpt = document.createElement("option");
      drivenOpt.value = initialFields[1];
      drivenOpt.text = initialFields[1] === "driven_next" ? "⟳ Driven (Next)" : "⟳ Driven";
      drivenOpt.style.fontStyle = "italic";
      rootSelect.appendChild(drivenOpt);
    }
    rootNotes.forEach((note) => {
      const opt = new Option(note, note);
      if (note === (initialFields[1] ?? "") && !isDrivenRootNote) opt.selected = true;
      rootSelect.appendChild(opt);
    });
    if (isDrivenRootNote) rootSelect.value = initialFields[1];
    rootSelect.addEventListener("change", () => onChange?.());
    rootWrapper.appendChild(rootSelect);
    fieldsContainer.appendChild(rootWrapper);

  } else if (layerType === "chord") {
    const entries = data.chordEntries ?? [];
    const chordWrapper = document.createElement("div");
    chordWrapper.classList.add("select", "is-small", "is-fullwidth");
    chordWrapper.style.flex = "1";
    chordWrapper.style.minWidth = "0";
    chordWrapper.style.maxWidth = "200px";
    const chordSelect = document.createElement("select");
    chordSelect.dataset.field = "chordKey";
    const isDrivenChordKey = initialFields[0] === "driven" || initialFields[0] === "driven_next";
    if (isDrivenChordKey) {
      const drivenOpt = document.createElement("option");
      drivenOpt.value = initialFields[0];
      drivenOpt.text = initialFields[0] === "driven_next" ? "⟳ Driven (Next)" : "⟳ Driven";
      drivenOpt.style.fontStyle = "italic";
      chordSelect.appendChild(drivenOpt);
    }
    entries.forEach(({ key, label }) => {
      const opt = new Option(label, key);
      if (key === (initialFields[0] ?? "") && !isDrivenChordKey) opt.selected = true;
      chordSelect.appendChild(opt);
    });
    if (isDrivenChordKey) chordSelect.value = initialFields[0];
    chordSelect.addEventListener("change", () => onChange?.());
    chordWrapper.appendChild(chordSelect);
    fieldsContainer.appendChild(chordWrapper);

  } else if (layerType === "notes") {
    const noteNames = data.noteNames ?? [];
    const activeNotes = new Set(
      (initialFields[0] ?? "").split(",").map((n) => n.trim()).filter((n) => n)
    );
    const toggleContainer = document.createElement("div");
    toggleContainer.dataset.field = "noteNames";
    toggleContainer.style.display = "flex";
    toggleContainer.style.flexWrap = "wrap";
    toggleContainer.style.gap = "3px";
    toggleContainer.style.flex = "1";
    noteNames.forEach((note) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.classList.add("button", "is-small", "is-outlined", "note-layer-toggle-btn");
      btn.textContent = note;
      btn.dataset.value = note;
      btn.title = note;
      if (activeNotes.has(note)) btn.classList.add("is-active", "is-info");
      btn.onclick = () => {
        btn.classList.toggle("is-active");
        btn.classList.toggle("is-info");
        onChange?.();
      };
      toggleContainer.appendChild(btn);
    });
    fieldsContainer.appendChild(toggleContainer);
  }
}

// --- Main Component ---

export interface InlineToggleConfig {
  label: string;
  defaultValue: boolean;
  argName: string;
  onChange: (checked: boolean) => void;
}

/**
 * Creates a layer list input with preset buttons and a collapsible custom layer editor.
 * Each row encodes one layer as a pipe-delimited string.
 */
export function createLayerListInput(
  container: HTMLElement,
  arg: ConfigurationSchemaArg,
  currentValues: string[],
  onChange?: () => void,
  inlineToggle?: InlineToggleConfig
): void {
  const data: LayerListComponentData = (arg.uiComponentData as LayerListComponentData) ?? {};

  // Rows container
  const rowsContainer = document.createElement("div");
  rowsContainer.classList.add("layer-list-rows");
  rowsContainer.style.display = "flex";
  rowsContainer.style.flexDirection = "column";
  rowsContainer.style.gap = "4px";
  rowsContainer.style.flex = "1 1 0";
  rowsContainer.style.minWidth = "0";

  let isLinked = false;
  let isLinkedHasNextSignals = false;

  // --- Preset state ---
  // presetBtns populated later; setActivePreset closes over the array by reference.
  const presetBtns: HTMLButtonElement[] = [];

  function getCurrentSigs(): string[] {
    const sigs: string[] = [];
    rowsContainer.querySelectorAll<HTMLElement>(".layer-list-row").forEach(row => {
      const type = row.querySelector<HTMLSelectElement>(".layer-type-select")?.value;
      if (type === "scale") {
        const scaleName = row.querySelector<HTMLSelectElement>("[data-field='scaleName']")?.value ?? "";
        const rootNote = row.querySelector<HTMLSelectElement>("[data-field='rootNote']")?.value ?? "";
        sigs.push(`scale|${scaleName}|${rootNote}`);
      } else if (type === "chord") {
        const chordKey = row.querySelector<HTMLSelectElement>("[data-field='chordKey']")?.value ?? "";
        sigs.push(`chord|${chordKey}`);
      } else if (type === "notes") {
        const noteNames = Array.from(rowsContainer.querySelectorAll<HTMLButtonElement>(".note-layer-toggle-btn.is-active"))
          .map(b => b.dataset.value ?? "").join(",");
        sigs.push(`notes|${noteNames}`);
      }
    });
    return sigs;
  }

  function matchPresetIndex(sigs: string[]): number | null {
    for (let i = 0; i < PRESETS.length; i++) {
      const p = PRESETS[i];
      if (sigs.length === p.signature.length && sigs.every((s, j) => s === p.signature[j])) return i;
    }
    return null;
  }

  function setActivePreset(idx: number | null): void {
    presetBtns.forEach((b, i) => b.classList.toggle("is-active", i === idx));
  }

  // Inner onChange that re-checks which preset is active after manual edits
  function notifyChange(): void {
    setActivePreset(matchPresetIndex(getCurrentSigs()));
    onChange?.();
  }

  // --- Linked driven-option helpers ---
  function applyLinkedToRow(row: HTMLElement, hasNextSignals: boolean): void {
    row.querySelectorAll<HTMLSelectElement>(
      "[data-field='rootNote'], [data-field='chordKey'], [data-field='scaleName']"
    ).forEach(select => {
      if (!select.querySelector<HTMLOptionElement>('option[value="driven"]')) {
        const opt = document.createElement("option");
        opt.value = "driven";
        opt.text = "⟳ Driven";
        opt.style.fontStyle = "italic";
        select.insertBefore(opt, select.firstChild);
      }
      if (hasNextSignals && !select.querySelector<HTMLOptionElement>('option[value="driven_next"]')) {
        const opt = document.createElement("option");
        opt.value = "driven_next";
        opt.text = "⟳ Driven (Next)";
        opt.style.fontStyle = "italic";
        const drivenOpt = select.querySelector<HTMLOptionElement>('option[value="driven"]');
        if (drivenOpt?.nextSibling) {
          select.insertBefore(opt, drivenOpt.nextSibling);
        } else {
          select.appendChild(opt);
        }
      }
      select.value = "driven";
    });
  }

  // --- Drag-and-drop ---
  let dragSrcEl: HTMLElement | null = null;

  function attachDragHandlers(row: HTMLElement): void {
    const handle = row.querySelector<HTMLElement>(".layer-drag-handle");
    if (!handle) return;
    row.addEventListener("dragstart", (e: DragEvent) => {
      dragSrcEl = row;
      row.style.opacity = "0.4";
      e.dataTransfer?.setData("text/plain", "");
    });
    row.addEventListener("dragend", () => {
      row.style.opacity = "";
      rowsContainer.querySelectorAll<HTMLElement>(".layer-list-row")
        .forEach(r => r.classList.remove("drag-over"));
    });
    row.addEventListener("dragover", (e: DragEvent) => {
      e.preventDefault();
      if (dragSrcEl && dragSrcEl !== row) row.classList.add("drag-over");
    });
    row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
    row.addEventListener("drop", (e: DragEvent) => {
      e.preventDefault();
      row.classList.remove("drag-over");
      if (dragSrcEl && dragSrcEl !== row) {
        const allRows = Array.from(rowsContainer.querySelectorAll<HTMLElement>(".layer-list-row"));
        const srcIdx = allRows.indexOf(dragSrcEl);
        const dstIdx = allRows.indexOf(row);
        if (srcIdx !== -1 && dstIdx !== -1) {
          if (srcIdx < dstIdx) {
            rowsContainer.insertBefore(dragSrcEl, row.nextSibling);
          } else {
            rowsContainer.insertBefore(dragSrcEl, row);
          }
          notifyChange();
        }
      }
    });
  }

  // --- Layer row builder ---
  function addLayerRow(layerType: LayerType, initialFields: string[], fillColor: string, strokeColor: string): void {
    const row = document.createElement("div");
    row.classList.add("layer-list-row");
    row.draggable = true;
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "5px";
    row.style.padding = "2px 4px";
    row.style.border = "1px solid var(--border)";
    row.style.borderRadius = "4px";
    row.style.background = "var(--input-bg)";

    const dragHandle = document.createElement("span");
    dragHandle.classList.add("layer-drag-handle");
    dragHandle.innerHTML = "&#x2630;";
    dragHandle.style.cursor = "grab";
    dragHandle.style.color = "var(--clr-text-subtle, #aaa)";
    dragHandle.style.flexShrink = "0";
    dragHandle.style.fontSize = "0.72rem";
    row.appendChild(dragHandle);

    const typeWrapper = document.createElement("div");
    typeWrapper.classList.add("select", "is-small");
    typeWrapper.style.flexShrink = "0";
    typeWrapper.style.minWidth = "105px";
    const typeSelect = document.createElement("select");
    typeSelect.classList.add("layer-type-select");
    (Object.keys(LAYER_TYPE_LABELS) as UiLayerType[]).forEach((t) => {
      const opt = new Option(LAYER_TYPE_LABELS[t], t);
      if (t === layerType) opt.selected = true;
      typeSelect.appendChild(opt);
    });
    typeWrapper.appendChild(typeSelect);
    row.appendChild(typeWrapper);

    const fieldsContainer = document.createElement("div");
    fieldsContainer.classList.add("layer-fields-container");
    fieldsContainer.style.display = "flex";
    fieldsContainer.style.gap = "4px";
    fieldsContainer.style.flexWrap = "wrap";
    fieldsContainer.style.flexGrow = "1";
    buildLayerFields(fieldsContainer, layerType, data, initialFields, notifyChange);
    row.appendChild(fieldsContainer);

    const fillColorPicker = createPaletteColorPicker(fillColor, 'fill', notifyChange);
    row.appendChild(fillColorPicker);

    const strokeColorPicker = createPaletteColorPicker(strokeColor, 'stroke', notifyChange);
    row.appendChild(strokeColorPicker);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.classList.add("layer-remove-btn");
    removeBtn.innerHTML = `<svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="1" y1="1" x2="8" y2="8"/><line x1="8" y1="1" x2="1" y2="8"/></svg>`;
    removeBtn.title = "Remove layer";
    removeBtn.onclick = () => { row.remove(); notifyChange(); };
    row.appendChild(removeBtn);

    typeSelect.addEventListener("change", () => {
      const newType = typeSelect.value as UiLayerType;
      (fillColorPicker as any)._setColor?.(getDefaultLayerColor(newType));
      (strokeColorPicker as any)._setColor?.('none');
      buildLayerFields(fieldsContainer, newType, data, [], notifyChange);
      if (isLinked) applyLinkedToRow(row, isLinkedHasNextSignals);
      notifyChange();
    });

    attachDragHandlers(row);
    rowsContainer.appendChild(row);
  }

  // --- Preset strip ---
  const presetStrip = document.createElement("div");
  presetStrip.classList.add("layer-preset-strip");

  if (inlineToggle) {
    const wrapper = document.createElement("div");
    wrapper.classList.add("config-checkbox-label");

    const textSpan = document.createElement("span");
    textSpan.textContent = inlineToggle.label;

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.dataset.argName = inlineToggle.argName;
    cb.checked = inlineToggle.defaultValue;

    const toggleLabel = document.createElement("label");
    toggleLabel.classList.add("toggle-switch", "toggle-switch--sm");
    const slider = document.createElement("span");
    slider.classList.add("toggle-switch__slider");
    toggleLabel.append(cb, slider);

    wrapper.append(textSpan, toggleLabel);
    presetStrip.appendChild(wrapper);

    const sep = document.createElement("span");
    sep.classList.add("layer-preset-sep");
    presetStrip.appendChild(sep);

    cb.addEventListener("change", () => inlineToggle.onChange(cb.checked));
  }

  for (let i = 0; i < PRESETS.length; i++) {
    const preset = PRESETS[i];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.classList.add("button", "is-small", "layer-preset-btn");
    btn.textContent = preset.label;
    btn.onclick = () => {
      rowsContainer.innerHTML = "";
      for (const layerStr of preset.layers) {
        const parsed = parseLayerStringForUI(layerStr);
        if (parsed) addLayerRow(parsed.type, parsed.fields, parsed.fillColor, parsed.strokeColor);
      }
      if (isLinked) {
        rowsContainer.querySelectorAll<HTMLElement>(".layer-list-row")
          .forEach(r => applyLinkedToRow(r, isLinkedHasNextSignals));
      }
      setActivePreset(i);
      onChange?.();
    };
    presetBtns.push(btn);
    presetStrip.appendChild(btn);
  }
  container.appendChild(presetStrip);

  // --- Customize toggle ---
  const initialSigs = currentValues.filter(Boolean).map(v => layerSignature(v));
  const initialActivePreset = matchPresetIndex(initialSigs);
  let customizeOpen = currentValues.length > 0 && initialActivePreset === null;

  const customizeToggle = document.createElement("button");
  customizeToggle.type = "button";
  customizeToggle.classList.add("layer-customize-toggle");
  customizeToggle.textContent = customizeOpen ? "▲" : "▼";

  const customizeSection = document.createElement("div");
  customizeSection.classList.add("layer-customize-section");
  customizeSection.hidden = !customizeOpen;

  customizeToggle.addEventListener("click", () => {
    customizeOpen = !customizeOpen;
    customizeSection.hidden = !customizeOpen;
    customizeToggle.textContent = customizeOpen ? "▲" : "▼";
  });

  // --- Controls row (customize arrow only) ---
  const controlsRow = document.createElement("div");
  controlsRow.classList.add("layer-controls-row");
  controlsRow.appendChild(customizeToggle);

  container.appendChild(controlsRow);
  container.appendChild(customizeSection);

  // --- Layer list container (inside collapsible section) ---
  const listContainer = document.createElement("div");
  listContainer.classList.add("layer-list-container");
  listContainer.style.display = "flex";
  listContainer.style.flexDirection = "row";
  listContainer.style.alignItems = "flex-start";
  listContainer.style.gap = "6px";
  listContainer.style.width = "100%";

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.classList.add("add-layer-btn");
  addBtn.innerHTML = '<span class="material-icons">add</span>';
  addBtn.onclick = () => {
    addLayerRow(LayerType.Scale, [], getDefaultLayerColor(LayerType.Scale), 'none');
    if (isLinked) {
      const lastRow = rowsContainer.lastElementChild as HTMLElement | null;
      if (lastRow) applyLinkedToRow(lastRow, isLinkedHasNextSignals);
    }
    notifyChange();
  };

  listContainer.appendChild(rowsContainer);
  listContainer.appendChild(addBtn);
  customizeSection.appendChild(listContainer);

  // Populate rows from saved values
  for (const val of currentValues) {
    if (!val) continue;
    const parsed = parseLayerStringForUI(val);
    if (parsed) addLayerRow(parsed.type, parsed.fields, parsed.fillColor, parsed.strokeColor);
  }

  // Set initial active preset highlight
  setActivePreset(initialActivePreset);

  // --- Linked/driven API ---
  (container as any)._setLinked = (linked: boolean, autoSelect: boolean, hasNextSignals = false) => {
    isLinked = linked;
    isLinkedHasNextSignals = hasNextSignals;
    let needsNotify = false;
    rowsContainer.querySelectorAll<HTMLSelectElement>(
      "[data-field='rootNote'], [data-field='chordKey'], [data-field='scaleName']"
    ).forEach(select => {
      const existingDriven = select.querySelector<HTMLOptionElement>('option[value="driven"]');
      const existingDrivenNext = select.querySelector<HTMLOptionElement>('option[value="driven_next"]');
      if (linked) {
        if (!existingDriven) {
          const opt = document.createElement("option");
          opt.value = "driven";
          opt.text = "⟳ Driven";
          opt.style.fontStyle = "italic";
          select.insertBefore(opt, select.firstChild);
        }
        if (hasNextSignals && !existingDrivenNext) {
          const opt = document.createElement("option");
          opt.value = "driven_next";
          opt.text = "⟳ Driven (Next)";
          opt.style.fontStyle = "italic";
          const drivenOpt = select.querySelector<HTMLOptionElement>('option[value="driven"]');
          if (drivenOpt?.nextSibling) {
            select.insertBefore(opt, drivenOpt.nextSibling);
          } else {
            select.appendChild(opt);
          }
        } else if (!hasNextSignals && existingDrivenNext) {
          if (select.value === "driven_next") select.value = "driven";
          existingDrivenNext.remove();
        }
        if (autoSelect && select.value !== "driven" && select.value !== "driven_next") {
          select.value = "driven";
          needsNotify = true;
        }
      } else {
        if (existingDrivenNext) {
          if (select.value === "driven_next") {
            const first = select.querySelector<HTMLOptionElement>('option:not([value="driven"]):not([value="driven_next"])');
            if (first) { select.value = first.value; needsNotify = true; }
          }
          existingDrivenNext.remove();
        }
        if (existingDriven) {
          if (select.value === "driven") {
            const first = select.querySelector<HTMLOptionElement>('option:not([value="driven"]):not([value="driven_next"])');
            if (first) { select.value = first.value; needsNotify = true; }
          }
          existingDriven.remove();
        }
      }
    });
    if (needsNotify) notifyChange();
  };
}

/** Reads all layer rows and returns encoded layer strings. */
export function extractLayerListValues(container: HTMLElement): string[] {
  const results: string[] = [];
  const rows = container.querySelectorAll<HTMLElement>(".layer-list-row");
  rows.forEach((row) => {
    const type = row.querySelector<HTMLSelectElement>(".layer-type-select")?.value as LayerType | undefined;
    const fillColor = row.querySelector<HTMLElement>(".layer-palette-btn[data-picker-role='fill']")?.dataset.colorVar
      ?? row.querySelector<HTMLElement>(".layer-palette-btn")?.dataset.colorVar
      ?? 'var(--dm-palette-1)';
    const strokeColor = row.querySelector<HTMLElement>(".layer-palette-btn[data-picker-role='stroke']")?.dataset.colorVar ?? 'none';
    if (!type) return;

    let encoded = "";
    if (type === "scale") {
      const scaleName = row.querySelector<HTMLSelectElement>("[data-field='scaleName']")?.value ?? "";
      const rootNote = row.querySelector<HTMLSelectElement>("[data-field='rootNote']")?.value ?? "";
      if (scaleName && rootNote) encoded = `scale|${scaleName}|${rootNote}|${fillColor}|${strokeColor}`;
    } else if (type === "chord") {
      const chordKey = row.querySelector<HTMLSelectElement>("[data-field='chordKey']")?.value ?? "";
      if (chordKey) encoded = `chord|${chordKey}|${fillColor}|${strokeColor}`;
    } else if (type === "notes") {
      const activeNotes = Array.from(
        row.querySelectorAll<HTMLButtonElement>(".note-layer-toggle-btn.is-active")
      ).map((btn) => btn.dataset.value ?? "").filter((v) => v);
      encoded = `notes|${activeNotes.join(",")}|${fillColor}|${strokeColor}`;
    }
    if (encoded) results.push(encoded);
  });
  return results;
}
