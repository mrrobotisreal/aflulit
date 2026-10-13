import { describe, expect, it } from 'vitest';

import { SPLASH_TITLE, SPLASH_TITLE_CODE_POINTS } from '../splash-title';

/**
 * T01: the splash title is exactly «אַפְלוּלִית» — NFC, 11 code points, no bidi
 * controls, no letter-spacing-breaking joiners. A stray mark order or a
 * precomposed/decomposed drift would silently change how the marks stack.
 */
describe('splash title «אַפְלוּלִית»', () => {
  it('is NFC and exactly the eleven pinned code points', () => {
    expect(SPLASH_TITLE.normalize('NFC')).toBe(SPLASH_TITLE);
    expect(Array.from(SPLASH_TITLE, (ch) => ch.codePointAt(0))).toEqual([
      ...SPLASH_TITLE_CODE_POINTS,
    ]);
    expect(SPLASH_TITLE_CODE_POINTS).toHaveLength(11);
  });

  it('contains only Hebrew letters and points — no bidi controls or spaces', () => {
    expect(SPLASH_TITLE).toMatch(/^[א-תְ-ֽׁׂ]+$/);
    expect(SPLASH_TITLE).not.toMatch(/[‎‏‪-‮⁦-⁩\s]/);
  });
});
