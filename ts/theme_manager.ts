export enum Theme {
  WARM = "warm",
  MOSS = "moss",
  SHERBET = "sherbet",
  SIGIL = "sigil",
  NEON = "neon",
}
export const themeNames: { key: Theme; title: string }[] = [
  { key: Theme.WARM, title: "Warm" },
  { key: Theme.MOSS, title: "Moss" },
  { key: Theme.SHERBET, title: "Sherbet" },
  { key: Theme.SIGIL, title: "Sigil" },
  { key: Theme.NEON, title: "Neon" },
];

/** Themes with a light background. They opt out of the `dark-theme` body class,
 *  which swaps borders/filled-cell outlines to dark-background-appropriate
 *  treatments (light hairlines, slate `--clr-*-dark` colors). */
const LIGHT_THEMES = new Set<Theme>([Theme.WARM, Theme.MOSS, Theme.SHERBET]);

type ThemeListener = (theme: Theme) => void;

export class ThemeManager {
  private _theme: Theme;
  private _listeners: ThemeListener[] = [];

  constructor(initialTheme: Theme = Theme.WARM) {
    this._theme = initialTheme;
  }

  apply(theme: Theme): void {
    this._theme = theme;
    document.documentElement.dataset.theme = theme;
    document.body.classList.toggle("dark-theme", !LIGHT_THEMES.has(theme));
    this._listeners.forEach((cb) => cb(theme));
  }

  get theme(): Theme {
    return this._theme;
  }

  subscribe(cb: ThemeListener): () => void {
    this._listeners.push(cb);
    return () => {
      this._listeners = this._listeners.filter((l) => l !== cb);
    };
  }
}
