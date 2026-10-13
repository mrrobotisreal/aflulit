/**
 * TS mirror of the theme tokens in src/global.css — ONLY for the places
 * NativeWind classes cannot reach: the react-navigation theme, status bar,
 * and native chrome. Components must use token classes (bg-bg, text-text…),
 * never these values directly. Keep in sync with global.css.
 *
 * Aflulit palette (docs-aflulit/design/UI_DESIGN.md §1): night-indigo base,
 * blue-violet accent, moon-blue glow — sampled from the crescent icon.
 */
export type ThemeScheme = 'dark' | 'light';

export interface ColorTokens {
  bg: string;
  surface: string;
  surface2: string;
  text: string;
  textMuted: string;
  accent: string;
  /**
   * The "moonlight" second hue (UI_DESIGN §1): focus rings, the splash title,
   * ring highlights, the karaoke caret.
   */
  glow: string;
  success: string;
  danger: string;
  border: string;
  /** Warm family-track identity (Sumrak T30) — icons/SVG the class system can't reach. */
  trackWarm: string;
  /** Readiness «with margin» band (Sumrak T70). */
  gold: string;
  /** Backdrop/shadow wash base (always used WITH an alpha) — scene layers (Sumrak T31). */
  scrim: string;
  /**
   * The streak flame grades the day (Today + widget; Sumrak T84 grading,
   * Mitch's blue spec 2026-10-13) — pale blue (started) → vibrant light blue
   * (1 ring) → deep blue (2) → deep purple with a light-blue halo (all).
   * Slot names are historical (flameYellow = the "one ring" slot, etc.) so
   * the TS and Kotlin grading code stays untouched. Kotlin mirror: WidgetPalette.
   */
  flamePale: string;
  flameYellow: string;
  flameOrange: string;
  flameRed: string;
  /** The all-three halo glow behind the flame (Sumrak's halo was yellow). */
  flameHalo: string;
}

export const colors: Record<ThemeScheme, ColorTokens> = {
  dark: {
    bg: '#0A0A17',
    surface: '#12112A',
    surface2: '#1A1838',
    text: '#E7E6F2',
    textMuted: '#9C9AB8',
    accent: '#6C63FF',
    glow: '#4DB1FA',
    success: '#6FA58C',
    danger: '#D0697A',
    border: '#26244A',
    trackWarm: '#B99A5B',
    gold: '#E2C462',
    scrim: '#000000',
    flamePale: '#BFD8FF',
    flameYellow: '#4DB1FA',
    flameOrange: '#2457D6',
    flameRed: '#5B2EC9',
    flameHalo: '#9CE6FE',
  },
  light: {
    bg: '#F6F5FB',
    surface: '#FFFFFF',
    surface2: '#ECEAF6',
    text: '#17162B',
    textMuted: '#5F5C78',
    accent: '#4A3CC8',
    glow: '#1F6FD1',
    success: '#3F7A60',
    danger: '#9E3346',
    border: '#DEDBEE',
    trackWarm: '#7E6533',
    gold: '#9E7A18',
    scrim: '#000000',
    flamePale: '#9DBDF0',
    flameYellow: '#2E8BE0',
    flameOrange: '#1E49B8',
    flameRed: '#4A25A8',
    flameHalo: '#7CC4FF',
  },
};
