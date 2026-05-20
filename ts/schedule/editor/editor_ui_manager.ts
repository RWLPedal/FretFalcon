// ts/schedule/editor/editor_ui_manager.ts

export class EditorUIManager {
  public containerEl: HTMLElement;
  public textEditorWrapperEl!: HTMLElement;
  public textEl!: HTMLTextAreaElement;
  public configEditorWrapperEl!: HTMLElement;
  public configEntriesContainerEl!: HTMLElement;
  public editorControlsContainerEl!: HTMLElement;
  public modeToggleEl!: HTMLButtonElement;
  public newScheduleButtonEl!: HTMLButtonElement;
  public addConfigEntryButtonEl!: HTMLButtonElement;
  public addGroupButtonEl!: HTMLButtonElement;
  public copyButtonEl!: HTMLButtonElement;
  public pasteButtonEl!: HTMLButtonElement;
  public setScheduleButtonEl!: HTMLButtonElement;

  constructor(containerEl: HTMLElement) {
    if (!containerEl)
      throw new Error("EditorUIManager: Container element is required.");
    this.containerEl = containerEl;
    this._renderBaseHTML();
  }

  private _renderBaseHTML(): void {
    this.containerEl.innerHTML = ""; // Clear container

    // --- Schedule Name Bar (editable on double-click, no separate edit button) ---
    const nameBar = document.createElement("div");
    nameBar.classList.add("schedule-name-bar");
    nameBar.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:8px;";

    const nameDisplay = document.createElement("p");
    nameDisplay.id = "schedule-name-display";
    nameDisplay.classList.add("schedule-name-display");
    nameDisplay.title = "Double-click to edit schedule name";
    nameDisplay.style.cssText = "flex:1;margin:0;font-weight:500;cursor:pointer;border-bottom:1px dashed transparent;";
    nameDisplay.contentEditable = "false";
    nameDisplay.addEventListener("dblclick", () => {
      nameDisplay.contentEditable = "true";
      nameDisplay.focus();
      nameDisplay.style.borderBottomColor = "var(--accent)";
      const range = document.createRange();
      range.selectNodeContents(nameDisplay);
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
    });
    nameDisplay.addEventListener("blur", () => {
      nameDisplay.contentEditable = "false";
      nameDisplay.style.borderBottomColor = "transparent";
    });
    nameDisplay.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        nameDisplay.blur();
      }
    });

    nameBar.appendChild(nameDisplay);
    this.containerEl.appendChild(nameBar);

    // --- Text Editor ---
    this.textEditorWrapperEl = document.createElement("div");
    this.textEditorWrapperEl.id = "text-editor-wrapper";
    this.textEditorWrapperEl.style.padding = "10px";
    this.textEditorWrapperEl.style.border = "1px solid #ccc";
    this.textEditorWrapperEl.style.marginBottom = "10px";

    this.textEl = document.createElement("textarea");
    this.textEl.id = "schedule-text-editor";
    this.textEl.classList.add("textarea");
    this.textEl.rows = 15;
    this.textEl.placeholder =
      "Enter schedule text here (e.g., 5:00, Warmup, Notes)";
    this.textEditorWrapperEl.appendChild(this.textEl);
    this.containerEl.appendChild(this.textEditorWrapperEl);

    // --- Config Editor ---
    this.configEditorWrapperEl = document.createElement("div");
    this.configEditorWrapperEl.id = "config-editor-wrapper";
    this.containerEl.appendChild(this.configEditorWrapperEl);

    this.configEntriesContainerEl = document.createElement("div");
    this.configEntriesContainerEl.id = "config-entries-container";
    this.configEntriesContainerEl.setAttribute("tabindex", "-1");
    this.configEntriesContainerEl.style.outline = "none";
    this.configEditorWrapperEl.appendChild(this.configEntriesContainerEl);

    // --- Editor Controls ---
    this.editorControlsContainerEl = document.createElement("div");
    this.editorControlsContainerEl.id = "editor-controls";
    this.editorControlsContainerEl.style.display = "flex";
    this.editorControlsContainerEl.style.flexWrap = "wrap";
    this.editorControlsContainerEl.style.gap = "10px";
    this.editorControlsContainerEl.style.marginTop = "10px";
    this.containerEl.appendChild(this.editorControlsContainerEl);

    // --- Create Buttons with Icons ---
    // Order: New, + Interval, + Group, Copy, Paste, Text Editor, Apply (→ Apply & Play)
    this.newScheduleButtonEl = this._createButton(
      "new-schedule",
      '<span class="material-icons">refresh</span>',
      ["is-outlined", "is-danger"],
      "Clear editor and start a new schedule"
    );
    this.addConfigEntryButtonEl = this._createButton(
      "add-config-entry",
      '<span class="material-icons">add</span>',
      ["is-outlined"],
      "Add Interval"
    );
    this.addGroupButtonEl = this._createButton(
      "add-group-entry",
      '<span class="material-icons">playlist_add</span>',
      ["is-outlined"],
      "Add Group Header"
    );
    this.copyButtonEl = this._createButton(
      "copy-schedule-rows",
      '<span class="material-icons">content_copy</span>',
      ["is-outlined"],
      "Copy Selected Rows (Ctrl+C)"
    );
    this.pasteButtonEl = this._createButton(
      "paste-schedule-rows",
      '<span class="material-icons">content_paste</span>',
      ["is-outlined"],
      "Paste Copied Rows (Ctrl+V)"
    );
    this.modeToggleEl = this._createButton(
      "mode-toggle",
      '<span class="material-icons">code</span> <span>Text Editor</span>',
      ["is-outlined"],
      "Switch to Text Editor"
    );
    this.setScheduleButtonEl = this._createButton(
      "set-schedule-control",
      '<span class="material-icons">check_circle</span> <span>Apply & Play</span>',
      ["is-primary"]
    );
    this.setScheduleButtonEl.style.marginLeft = "auto";

    // --- Append Buttons in Specified Order ---
    this.editorControlsContainerEl.append(
      this.newScheduleButtonEl,
      this.addConfigEntryButtonEl,
      this.addGroupButtonEl,
      this.copyButtonEl,
      this.pasteButtonEl,
      this.modeToggleEl,
      this.setScheduleButtonEl
    );

    this.updateCopyPasteButtonState(false, false);
  }

  private _createButton(
    id: string,
    innerHTML: string,
    extraClasses: string[] = [],
    title: string = ""
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.id = id;
    button.classList.add("button", "is-small", ...extraClasses);
    button.innerHTML = innerHTML;
    if (title) button.title = title;
    return button;
  }

  public setModeUI(isTextMode: boolean): void {
    this.textEditorWrapperEl.style.display = isTextMode ? "block" : "none";
    this.configEditorWrapperEl.style.display = isTextMode ? "none" : "block";
    // Update mode toggle button text/icon based on current mode
    this.modeToggleEl.innerHTML = isTextMode
      ? '<span class="material-icons">tune</span> <span>Config Editor</span>'
      : '<span class="material-icons">code</span> <span>Text Editor</span>';
    this.modeToggleEl.title = isTextMode
      ? "Switch to Config Editor"
      : "Switch to Text Editor";
    // Toggle visibility of config-only buttons
    const configOnly = [this.newScheduleButtonEl, this.addConfigEntryButtonEl, this.addGroupButtonEl, this.copyButtonEl, this.pasteButtonEl];
    const display = isTextMode ? "none" : "inline-flex";
    configOnly.forEach(btn => btn.style.display = display);
  }

  public setApplyButtonLabel(label: string): void {
    this.setScheduleButtonEl.innerHTML = `<span class="material-icons">check_circle</span> <span>${label}</span>`;
  }

  public updateCopyPasteButtonState(canCopy: boolean, canPaste: boolean): void {
    this.copyButtonEl.toggleAttribute("disabled", !canCopy);
    this.pasteButtonEl.toggleAttribute("disabled", !canPaste);
  }

  public populateConfigUI(
    buildRowCallback: (rowData: any) => HTMLElement | null,
    rowDataArray: any[]
  ): void {
    while (this.configEntriesContainerEl.firstChild) {
      this.configEntriesContainerEl.removeChild(
        this.configEntriesContainerEl.firstChild
      );
    }
    rowDataArray.forEach((rowData) => {
      const rowElement = buildRowCallback(rowData);
      if (rowElement) {
        this.configEntriesContainerEl.appendChild(rowElement);
      }
    });
  }
}