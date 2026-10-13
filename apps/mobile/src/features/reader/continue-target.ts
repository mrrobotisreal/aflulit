/**
 * T84: «Continue reading» = continue what Mitch LAST READ — the one rule the
 * home-screen widget and Today's card share. PURE (no DB, no React).
 *
 * The T40 rule picked the newest UNFINISHED row, so finishing a part made the
 * target fall back to some old unfinished story (his one news article) — and
 * opening that story bumped its `updatedAt`, so it won forever. Now:
 *
 * 1. Take the most recently read story (newest `updatedAt`, finished or not).
 * 2. Unfinished → resume it at its saved position.
 * 3. Finished → the next story of the same pack by `orderIdx` (resuming its
 *    saved position if it was started and not finished).
 * 4. Finished and the last of its pack (or the next one is already finished)
 *    → the newest unfinished story anywhere; none → null (open the Library).
 */

export interface ContinueProgress {
  packId: string;
  storyId: string;
  updatedAt: number;
  finishedAt: number | null;
}

export interface ContinueStory {
  packId: string;
  id: string;
  orderIdx: number;
  titleRu: string;
}

export type ContinueKind = 'resume' | 'next' | 'fallback';

export interface ContinueTarget {
  packId: string;
  storyId: string;
  title: string;
  kind: ContinueKind;
}

const key = (packId: string, storyId: string) => `${packId}\u0000${storyId}`;

export function resolveContinueTarget(
  progress: readonly ContinueProgress[],
  stories: readonly ContinueStory[],
): ContinueTarget | null {
  const storyByKey = new Map(stories.map((s) => [key(s.packId, s.id), s]));
  const progressByKey = new Map(progress.map((p) => [key(p.packId, p.storyId), p]));
  // Rows whose story was removed with its pack are invisible to every rule.
  const live = progress
    .filter((p) => storyByKey.has(key(p.packId, p.storyId)))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const last = live[0];
  if (!last) return null;

  const lastStory = storyByKey.get(key(last.packId, last.storyId))!;
  if (last.finishedAt == null) {
    return { packId: last.packId, storyId: last.storyId, title: lastStory.titleRu, kind: 'resume' };
  }

  const next = stories
    .filter((s) => s.packId === last.packId && s.orderIdx > lastStory.orderIdx)
    .sort((a, b) => a.orderIdx - b.orderIdx)[0];
  if (next && progressByKey.get(key(next.packId, next.id))?.finishedAt == null) {
    return { packId: next.packId, storyId: next.id, title: next.titleRu, kind: 'next' };
  }

  const unfinished = live.find((p) => p.finishedAt == null);
  if (!unfinished) return null;
  const s = storyByKey.get(key(unfinished.packId, unfinished.storyId))!;
  return {
    packId: unfinished.packId,
    storyId: unfinished.storyId,
    title: s.titleRu,
    kind: 'fallback',
  };
}
