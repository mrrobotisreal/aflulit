import { describe, expect, it } from 'vitest';

import {
  resolveContinueTarget,
  type ContinueProgress,
  type ContinueStory,
} from '../continue-target';

const pw = (n: number): ContinueStory => ({
  packId: 'a2-peeking-wife-001',
  id: `part-${n}`,
  orderIdx: n - 1,
  titleRu: `Часть ${n}`,
});
const STORIES: ContinueStory[] = [
  ...[1, 2, 3, 4, 5, 6, 7].map(pw),
  { packId: 'a2-news-001', id: 'drones', orderIdx: 0, titleRu: 'Новости' },
];
const row = (
  packId: string,
  storyId: string,
  updatedAt: number,
  finishedAt: number | null = null,
): ContinueProgress => ({ packId, storyId, updatedAt, finishedAt });

describe('resolveContinueTarget (T84)', () => {
  it("Mitch's real S24U shape: finished part-5 newest, unfinished news just before → part-6, not the news", () => {
    // story_progress pulled 2026-10-11 (times = minutes for readability).
    const progress = [
      row('a2-peeking-wife-001', 'part-5', 1002, 900),
      row('a2-news-001', 'drones', 1001),
      row('a2-peeking-wife-001', 'part-4', 500, 400),
    ];
    expect(resolveContinueTarget(progress, STORIES)).toEqual({
      packId: 'a2-peeking-wife-001',
      storyId: 'part-6',
      title: 'Часть 6',
      kind: 'next',
    });
  });

  it('resumes the last-read story when it is unfinished (e.g. 47 % into part 4)', () => {
    const progress = [row('a2-peeking-wife-001', 'part-4', 50), row('a2-news-001', 'drones', 10)];
    expect(resolveContinueTarget(progress, STORIES)).toMatchObject({
      storyId: 'part-4',
      kind: 'resume',
    });
  });

  it('opening the news once and leaving it does not lock it in: finishing a part moves on', () => {
    const progress = [
      row('a2-peeking-wife-001', 'part-4', 60, 60),
      row('a2-news-001', 'drones', 59),
    ];
    expect(resolveContinueTarget(progress, STORIES)).toMatchObject({
      storyId: 'part-5',
      kind: 'next',
    });
  });

  it('a started-but-unfinished next part is resumed as the next target', () => {
    const progress = [
      row('a2-peeking-wife-001', 'part-4', 60, 60),
      row('a2-peeking-wife-001', 'part-5', 30),
    ];
    expect(resolveContinueTarget(progress, STORIES)).toMatchObject({
      storyId: 'part-5',
      kind: 'next',
    });
  });

  it('last part of a pack finished → newest unfinished story anywhere', () => {
    const progress = [
      row('a2-peeking-wife-001', 'part-7', 90, 90),
      row('a2-news-001', 'drones', 20),
    ];
    expect(resolveContinueTarget(progress, STORIES)).toMatchObject({
      packId: 'a2-news-001',
      kind: 'fallback',
    });
  });

  it('next part already finished → fallback (never re-serves finished reading)', () => {
    const progress = [
      row('a2-peeking-wife-001', 'part-4', 90, 90),
      row('a2-peeking-wife-001', 'part-5', 80, 80),
    ];
    expect(resolveContinueTarget(progress, STORIES)).toBeNull();
  });

  it('everything finished at the end of a pack → null (open the Library)', () => {
    expect(resolveContinueTarget([row('a2-peeking-wife-001', 'part-7', 9, 9)], STORIES)).toBeNull();
  });

  it('ignores progress rows whose story was removed', () => {
    const progress = [row('gone-pack', 'x', 99), row('a2-peeking-wife-001', 'part-2', 10)];
    expect(resolveContinueTarget(progress, STORIES)).toMatchObject({
      storyId: 'part-2',
      kind: 'resume',
    });
  });

  it('no progress → null', () => {
    expect(resolveContinueTarget([], STORIES)).toBeNull();
  });
});
