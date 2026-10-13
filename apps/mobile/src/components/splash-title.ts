/**
 * The splash wordmark, exactly «אַפְלוּלִית» (ADR-0002; UI_DESIGN §2): NFC,
 * eleven code points — alef + patah, pe + shva, lamed, vav + dagesh, lamed +
 * hiriq, yod, tav. Kept in its own module so a Node unit test can pin the
 * code points without rendering the component.
 */
export const SPLASH_TITLE = 'אַפְלוּלִית';

/** The exact code points of SPLASH_TITLE, pinned by the T01 unit test. */
export const SPLASH_TITLE_CODE_POINTS = [
  0x05d0, 0x05b7, 0x05e4, 0x05b0, 0x05dc, 0x05d5, 0x05bc, 0x05dc, 0x05b4, 0x05d9, 0x05ea,
] as const;
