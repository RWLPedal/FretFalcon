// ts/core/config/spec.ts
// Typed configuration system for feature panels.
// Replaces the positional string-array approach in feature.ts.

import { DriveSignal, SignalKind } from '../../panels/link_types';
import { AppSettings } from '../../settings';

// ─── Codec ────────────────────────────────────────────────────────────────────

export interface FieldCodec<T> {
  serialize(v: T): string;
  parse(raw: string): T | undefined;
}

// ─── UI controls ─────────────────────────────────────────────────────────────

export interface LabelValue { label: string; value: string; }

export type SelectOption = { value: string; label?: string };

/** Returned by {kind:'custom'}.render(). Gives the form builder read/write access to the widget. */
export interface CustomFieldController<T = unknown> {
  getValue(): T;
  setValue(v: T): void;
  setLinkStatus?(hasLinks: boolean, autoSelect: boolean, hasNext: boolean): void;
  destroy?(): void;
}

export interface CustomRenderContext {
  appSettings: AppSettings;
  onChange(): void;
  /** Returns the current effective value for each field (resolves driven values where available). */
  getFieldValues(): Record<string, unknown>;
}

export type UiControl =
  | { kind: 'select'; options: SelectOption[]; }
  | {
      kind: 'toggleButtons';
      options?: (string | LabelValue)[];
      advancedOptions?: (string | LabelValue)[];
      /** Mode-keyed labels for key-dependent toggle sets (e.g. chord qualities). */
      labelsByMode?: Record<string, { basic: LabelValue[]; advanced: LabelValue[] }>;
    }
  | { kind: 'number'; min?: number; max?: number; step?: number }
  | { kind: 'checkbox' }
  | { kind: 'toggle'; defaultChecked?: boolean }
  | {
      kind: 'custom';
      render(container: HTMLElement, ctx: CustomRenderContext): CustomFieldController;
    };

// ─── FieldSpec ────────────────────────────────────────────────────────────────

export interface FieldSpec<T> {
  label: string;
  codec: FieldCodec<T>;
  ui: UiControl;
  defaultValue: T;
  /**
   * If set, this field can be driven by an incoming signal instead of manually set.
   * `fromSignal` translates an incoming DriveSignal to the field's type.
   * Returns undefined if this signal cannot supply a value for this field.
   */
  drivable?: {
    kinds: SignalKind[];
    fromSignal(s: DriveSignal): T | undefined;
    /** When true, the driven value updates the field display silently (no sentinel option shown). */
    transparent?: boolean;
  };
  /**
   * Key of another field in the same spec that this field's value controls
   * (e.g. a Key dropdown that rebuilds a chord-quality toggle-button set).
   */
  controls?: string;
}

export type ConfigSpec<C> = { [K in keyof C]: FieldSpec<C[K]> };

// ─── ConfigValue / DrivenConfig ───────────────────────────────────────────────

export type ConfigValue<T> =
  | { mode: 'literal'; value: T }
  | { mode: 'driven' }
  | { mode: 'drivenNext' };

export type DrivenConfig<C> = { [K in keyof C]: ConfigValue<C[K]> };

// ─── DrivenState ─────────────────────────────────────────────────────────────
// Per-field typed caches populated by receiveSignals.

export interface DrivenState {
  current: Map<string, unknown>;
  next: Map<string, unknown>;
}

export function emptyDrivenState(): DrivenState {
  return { current: new Map(), next: new Map() };
}

/** Build a DrivenConfig with every field set to its default literal value. */
export function defaultDrivenConfig<C>(spec: ConfigSpec<C>): DrivenConfig<C> {
  const result: Partial<DrivenConfig<C>> = {};
  for (const key of Object.keys(spec) as (keyof C)[]) {
    (result as any)[key] = { mode: 'literal', value: spec[key].defaultValue };
  }
  return result as DrivenConfig<C>;
}
