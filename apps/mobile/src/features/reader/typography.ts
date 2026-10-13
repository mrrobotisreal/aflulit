import type { TextStyle } from 'react-native';

import type { ReaderPrefs } from '@/store/reader-prefs';

/**
 * The reading type scale (UI_DESIGN §2): user-adjustable size (5 steps) and
 * line-height (3 steps) around the ~19px/1.6 default, serif (Frank Ruhl
 * Libre) ↔ sans (Noto Sans Hebrew) toggle (ADR-0005 §8). Values live here —
 * prefs store only indices. T05 re-cuts the ladder for pointed text.
 */
export const READER_SIZE_STEPS = [16, 17.5, 19, 21, 23.5] as const;
export const READER_LINE_HEIGHT_STEPS = [1.4, 1.6, 1.8] as const;

const clamp = (i: number, max: number) => Math.min(max, Math.max(0, i));

export function readerFontSize(prefs: ReaderPrefs): number {
  return READER_SIZE_STEPS[clamp(prefs.sizeStep, READER_SIZE_STEPS.length - 1)]!;
}

/** Style for the story text (Hebrew after T04). */
export function readingTextStyle(prefs: ReaderPrefs): TextStyle {
  const fontSize = readerFontSize(prefs);
  const ratio =
    READER_LINE_HEIGHT_STEPS[clamp(prefs.lineHeightStep, READER_LINE_HEIGHT_STEPS.length - 1)]!;
  return {
    fontSize,
    lineHeight: Math.round(fontSize * ratio),
    fontFamily: prefs.serif ? 'FrankRuhlLibre_400Regular' : 'NotoSansHebrew_400Regular',
  };
}

/** Style for the revealed English translation — smaller; the reading faces have no italic. */
export function translationTextStyle(prefs: ReaderPrefs): TextStyle {
  const fontSize = Math.round(readerFontSize(prefs) * 0.82);
  return {
    fontSize,
    lineHeight: Math.round(fontSize * 1.45),
    fontFamily: prefs.serif ? 'FrankRuhlLibre_400Regular' : 'GolosText_400Regular',
  };
}
