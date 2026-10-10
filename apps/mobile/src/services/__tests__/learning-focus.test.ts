import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { track } from '../analytics';
import {
  createSliceFocus,
  FOCUS_SETTLE_MS,
  holdLearningFocus,
  setFocusBackendForTests,
} from '../learning-focus';

vi.mock('../analytics', () => ({ track: vi.fn() }));

function makeBackend(result: 'granted' | 'delayed' | 'failed' = 'granted') {
  return {
    requestTransientFocus: vi.fn().mockResolvedValue(result),
    abandonTransientFocus: vi.fn(),
  };
}

describe('learning focus wrapper', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
    setFocusBackendForTests(undefined);
  });

  it('requests focus, settles, reports analytics and abandons exactly once', async () => {
    const b = makeBackend();
    setFocusBackendForTests(b);
    const p = holdLearningFocus('listening-quiz', 'segment');
    await vi.advanceTimersByTimeAsync(FOCUS_SETTLE_MS);
    const h = await p;
    expect(h.result).toBe('granted');
    h.release();
    h.release();
    expect(b.abandonTransientFocus).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith(
      'learning_audio_focus',
      expect.objectContaining({ surface: 'listening-quiz', engine: 'segment', result: 'granted' }),
    );
  });

  it('a failed request never throws and has nothing to abandon', async () => {
    const b = makeBackend('failed');
    setFocusBackendForTests(b);
    const h = await holdLearningFocus('x', 'system');
    h.release();
    expect(h.result).toBe('failed');
    expect(b.abandonTransientFocus).not.toHaveBeenCalled();
  });

  it('works with no native backend (off-device)', async () => {
    setFocusBackendForTests(null);
    const h = await holdLearningFocus('x', 'system');
    expect(h.result).toBe('failed');
    expect(() => h.release()).not.toThrow();
  });

  it('slice focus: replay releases the previous hold; release abandons; late acquire is dropped', async () => {
    const b = makeBackend();
    setFocusBackendForTests(b);
    const s = createSliceFocus('t');
    const a1 = s.acquire();
    await vi.advanceTimersByTimeAsync(FOCUS_SETTLE_MS);
    await a1;
    const a2 = s.acquire(); // replay mid-clip
    await vi.advanceTimersByTimeAsync(FOCUS_SETTLE_MS);
    await a2;
    expect(b.requestTransientFocus).toHaveBeenCalledTimes(2);
    expect(b.abandonTransientFocus).toHaveBeenCalledTimes(1);
    s.release();
    expect(b.abandonTransientFocus).toHaveBeenCalledTimes(2);

    const a3 = s.acquire();
    s.release(); // stop while the request is in flight
    await vi.advanceTimersByTimeAsync(FOCUS_SETTLE_MS);
    await a3;
    expect(b.abandonTransientFocus).toHaveBeenCalledTimes(3);
  });
});
