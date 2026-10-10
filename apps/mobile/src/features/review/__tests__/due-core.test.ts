import { describe, expect, it } from 'vitest';

import { classifySource, clampNewPerDay, DEFAULT_QUEUE_PREFS, parseQueuePrefs } from '../due-core';

describe('queue prefs', () => {
  it('defaults: 10 words a day, sibling bury on', () => {
    expect(DEFAULT_QUEUE_PREFS).toEqual({ v: 1, newPerDay: 10, buryRelated: true });
    expect(parseQueuePrefs(undefined)).toEqual(DEFAULT_QUEUE_PREFS);
  });
  it('heals corrupt values field by field', () => {
    expect(parseQueuePrefs({ v: 1, newPerDay: 999, buryRelated: false })).toEqual({
      v: 1,
      newPerDay: 10,
      buryRelated: false,
    });
    expect(parseQueuePrefs('junk')).toEqual(DEFAULT_QUEUE_PREFS);
    expect(parseQueuePrefs({ v: 1, newPerDay: 25, buryRelated: 'x' }).newPerDay).toBe(25);
  });
  it('clamps to 0–50', () => {
    expect(clampNewPerDay(-3)).toBe(0);
    expect(clampNewPerDay(80)).toBe(50);
    expect(clampNewPerDay(12.4)).toBe(12);
    expect(clampNewPerDay(Number.NaN)).toBe(10);
  });
});

describe('classifySource', () => {
  const base = { sourceStoryId: null, sourceSentenceId: null, hasJournalEncounter: false };
  it('maps the columns a bank item already carries', () => {
    expect(classifySource({ ...base, sourceStoryId: 'lx-food', sourceSentenceId: 's1' })).toBe(
      'topic',
    );
    expect(classifySource({ ...base, sourceStoryId: 'story', sourceSentenceId: 's1' })).toBe(
      'reader',
    );
    expect(classifySource({ ...base, sourceStoryId: 'a1-scn-bank-001' })).toBe('scenario');
    expect(classifySource({ ...base, hasJournalEncounter: true })).toBe('journal');
    expect(classifySource(base)).toBe('manual');
  });
});
