/**
 * Represents a UI component associated with a Feature, managing its own rendering and lifecycle.
 */
export interface View {
  /**
   * Renders the initial state of the view into the provided container.
   * @param {HTMLElement} container - The parent element to render into.
   */
  render(container: HTMLElement): void;

  /**
   * Starts active processes (e.g., animation, event listeners).
   * Called when the containing interval's timer starts or resumes.
   */
  start(): void;

  /**
   * Stops active processes.
   * Called when the containing interval's timer pauses or ends.
   */
  stop(): void;

  /**
   * Cleans up resources (e.g., remove elements, detach listeners).
   * Called when the view is permanently removed (e.g., interval ends).
   */
  destroy(): void;
}
