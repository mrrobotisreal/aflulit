/**
 * T84: the ONE definition of Today's goal rings and the streak flame, shared by
 * the Today card (`goal-ring-card.tsx`) and the home-screen widget snapshot —
 * so the widget can never drift from what the app shows. PURE.
 *
 * Rings, outside → in (T19/T34): reviews (`accent`, orange-red) · reading
 * (`textMuted`, gray) · the daily quest (`gold`, yellow — only on a day with a
 * quest). A target of 0 disables a part: its ring reads full (T19 behaviour).
 *
 * The flame grades the day (Mitch, 2026-10-12): nothing started → unlit;
 * anything started → pale yellow; one ring complete → bright yellow; two →
 * bright orange; EVERY ring complete → bright orange-red with a glow. On a
 * quest-less day there are two rings, so two complete is «all» (recorded
 * default — Mitch's spec assumed three).
 */

export interface GoalRingInput {
  reviewsDone: number;
  reviewsTarget: number;
  readingMs: number;
  readingMinTarget: number;
  quest: { progress: number; target: number; complete: boolean } | null;
}

export interface GoalRings {
  reviews: number;
  reading: number;
  /** null on a day without a quest — the ring is not drawn. */
  quest: number | null;
}

export type FlameTier = 'none' | 'started' | 'one' | 'two' | 'all';

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

export function goalRings(input: GoalRingInput): GoalRings {
  const reviews = input.reviewsTarget > 0 ? clamp01(input.reviewsDone / input.reviewsTarget) : 1;
  const reading =
    input.readingMinTarget > 0 ? clamp01(input.readingMs / (input.readingMinTarget * 60_000)) : 1;
  const quest = input.quest
    ? input.quest.complete
      ? 1
      : input.quest.target > 0
        ? clamp01(input.quest.progress / input.quest.target)
        : 0
    : null;
  return { reviews, reading, quest };
}

/**
 * «Started» means the user did something today — a disabled part (target 0)
 * reads full but never counts as started on its own, or the flame would glow
 * pale yellow on an untouched day.
 */
export function flameTier(input: GoalRingInput): FlameTier {
  const rings = goalRings(input);
  const parts: { fraction: number; touched: boolean }[] = [
    { fraction: rings.reviews, touched: input.reviewsDone > 0 },
    { fraction: rings.reading, touched: input.readingMs > 0 },
  ];
  if (rings.quest != null) {
    parts.push({ fraction: rings.quest, touched: (input.quest?.progress ?? 0) > 0 });
  }
  // A disabled part (target 0) reads full and counts as complete, as on Today.
  const complete = parts.filter((p) => p.fraction >= 1).length;
  const started = parts.some((p) => p.touched);
  if (!started) return 'none';
  if (complete >= parts.length) return 'all';
  if (complete === 2) return 'two';
  if (complete === 1) return 'one';
  return 'started';
}
