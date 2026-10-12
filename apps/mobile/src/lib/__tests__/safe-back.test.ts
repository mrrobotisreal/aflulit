import { describe, expect, it, vi } from 'vitest';

import { safeBack } from '../safe-back';

const fake = (canGoBack: boolean) => ({
  canGoBack: () => canGoBack,
  back: vi.fn(),
  replace: vi.fn(),
});

describe('safeBack (T84)', () => {
  it('goes back when there is somewhere to go', () => {
    const r = fake(true);
    expect(safeBack(r)).toBe('back');
    expect(r.back).toHaveBeenCalledOnce();
    expect(r.replace).not.toHaveBeenCalled();
  });

  it('a deep-linked screen with nothing beneath it goes home instead of dead-ending', () => {
    const r = fake(false);
    expect(safeBack(r)).toBe('home');
    expect(r.replace).toHaveBeenCalledWith('/(tabs)');
    expect(r.back).not.toHaveBeenCalled();
  });
});
