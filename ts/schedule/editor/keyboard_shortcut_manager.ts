import { ClipboardManager } from "./clipboard_manager";
import { RowManager } from "./row_manager";

export class KeyboardShortcutManager {
  private targetElement: HTMLElement; // Element to listen on (e.g., config container)
  private clipboardManager: ClipboardManager;
  private rowManager: RowManager;
  private isEnabled: () => boolean; // Function to check if shortcuts should be active (e.g., config mode)

  constructor(
    targetElement: HTMLElement,
    clipboardManager: ClipboardManager,
    rowManager: RowManager,
    isEnabled: () => boolean
  ) {
    this.targetElement = targetElement;
    this.clipboardManager = clipboardManager;
    this.rowManager = rowManager;
    this.isEnabled = isEnabled;
    this._initialize();
  }

  private _initialize(): void {
    this.targetElement.addEventListener(
      "keydown",
      this._handleKeyDown.bind(this)
    );
  }

  private _handleKeyDown(e: KeyboardEvent): void {
    // Check if shortcuts are enabled (e.g., editor is in config mode)
    if (!this.isEnabled()) return;

    // Ignore shortcuts if focus is inside an input/textarea/select
    const target = e.target as HTMLElement;
    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT"
    ) {
      // Allow default browser behavior (like Ctrl+C/V in text fields)
      return;
    }

    const isCtrlPressed = e.ctrlKey || e.metaKey; // metaKey for macOS

    if (isCtrlPressed && e.key.toLowerCase() === "c") {
      e.preventDefault();
      this.clipboardManager.copySelectedRows();
    } else if (isCtrlPressed && e.key.toLowerCase() === "v") {
      e.preventDefault();
      this.clipboardManager.pasteRows();
    } else if (e.key === "Delete" || e.key === "Backspace") {
      // Prevent Backspace from navigating back in browser
      e.preventDefault();
      this.rowManager.deleteSelectedRows();
    }
    // Add other shortcuts here (e.g., Ctrl+X for cut, Ctrl+D for duplicate)
  }
}
