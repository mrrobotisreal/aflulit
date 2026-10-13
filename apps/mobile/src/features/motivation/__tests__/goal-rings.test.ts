import { describe, expect, it } from 'vitest';

import { flameTier, goalRings, type GoalRingInput } from '../goal-rings';

const base: GoalRingInput = {
  reviewsDone: 0,
  reviewsTarget: 20,
  readingMs: 0,
  readingMinTarget: 10,
  quest: { progress: 0, target: 3, complete: false },
};
const MIN = 60_000;

describe('goalRings (T84 — the Today/widget shared fractions)', () => {
  it('matches Today: reviews/target, readingMs/(min·60 000), quest progress/target, clamped', () => {
    expect(
      goalRings({
        ...base,
        reviewsDone: 10,
        readingMs: 5 * MIN,
        quest: { progress: 1, target: 4, complete: false },
      }),
    ).toEqual({ reviews: 0.5, reading: 0.5, quest: 0.25 });
    expect(goalRings({ ...base, reviewsDone: 99, readingMs: 99 * MIN }).reviews).toBe(1);
  });

  it('a 0 target reads full (T19); no quest today → no quest ring', () => {
    expect(goalRings({ ...base, reviewsTarget: 0, quest: null })).toEqual({
      reviews: 1,
      reading: 0,
      quest: null,
    });
  });

  it('a completed quest reads full even if progress lags its target', () => {
    expect(goalRings({ ...base, quest: { progress: 1, target: 3, complete: true } }).quest).toBe(1);
  });
});

describe('flameTier (T84 — Mitch: pale yellow → yellow → orange → orange-red glow)', () => {
  it('nothing touched → none (even with a disabled, full ring)', () => {
    expect(flameTier(base)).toBe('none');
    expect(flameTier({ ...base, reviewsTarget: 0 })).toBe('none');
  });

  it('anything started, nothing complete → started (pale yellow)', () => {
    expect(flameTier({ ...base, readingMs: MIN })).toBe('started');
    expect(flameTier({ ...base, quest: { progress: 1, target: 3, complete: false } })).toBe(
      'started',
    );
  });

  it('one ring complete → one (bright yellow)', () => {
    expect(flameTier({ ...base, reviewsDone: 20 })).toBe('one');
  });

  it('two rings complete on a quest day → two (bright orange)', () => {
    expect(flameTier({ ...base, reviewsDone: 20, readingMs: 10 * MIN })).toBe('two');
  });

  it('all three complete → all (orange-red glow)', () => {
    expect(
      flameTier({
        ...base,
        reviewsDone: 20,
        readingMs: 10 * MIN,
        quest: { progress: 3, target: 3, complete: true },
      }),
    ).toBe('all');
  });

  it('quest-less day: both rings complete = all (recorded default)', () => {
    expect(flameTier({ ...base, quest: null, reviewsDone: 20, readingMs: 10 * MIN })).toBe('all');
    expect(flameTier({ ...base, quest: null, reviewsDone: 20 })).toBe('one');
  });
});
