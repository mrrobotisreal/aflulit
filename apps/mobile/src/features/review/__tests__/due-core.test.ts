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

describe('copy', () => {
  it('split line + backlog + bulk toast', async () => {
    const { splitLine, backlogLine, bulkBankToast } = await import('../due-core');
    expect(splitLine(30, 12)).toBe('30 повторений + 12 новых');
    expect(splitLine(21, 1)).toBe('21 повторение + 1 новая');
    expect(splitLine(0, 10)).toBe('10 новых');
    expect(splitLine(5, 0)).toBe('5 повторений');
    expect(backlogLine(286)).toBe('В очереди: 286 новых');
    expect(backlogLine(0)).toBeNull();
    expect(bulkBankToast(87, 10)).toBe('+87 слов в Словаре · по 10 в день');
  });
});

describe('one function for every consumer (source scan)', () => {
  it('no consumer reads the raw card count or raw due list any more', async () => {
    const { readFileSync } = await import('node:fs');
    const files = [
      'src/db/hooks.ts',
      'src/features/motivation/widget-sync.ts',
      'src/features/motivation/notifications.ts',
      'src/features/review/daily/session.ts',
      'src/features/review/session.ts',
      'src/features/review/games/cloze/session.ts',
      'src/features/review/games/listening/session.ts',
      'src/features/review/games/sentence-builder/session.ts',
      'src/features/pronunciation/session.ts',
    ];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/reviews\s*\.\s*countDueCards|reviews\s*\.\s*listDueCards/);
    }
  });
});
