import { z } from 'zod';

import { flameTier, goalRings } from './goal-rings';
import { WIDGET_SNAPSHOT_VERSION, WIDGET_STALE_MS } from './widget-contract';

/**
 * The widget's whole world (T40): a tiny JSON snapshot the app writes on every
 * daily-activity change and the widget renders with no DB access. PURE — no
 * react-native imports, so vitest can exercise it directly.
 */

const NonNegInt = z.number().int().min(0);

export const WidgetSnapshotSchema = z.strictObject({
  v: z.literal(WIDGET_SNAPSHOT_VERSION),
  streak: NonNegInt,
  dueCount: NonNegInt,
  goal: z.strictObject({
    reviewsDone: NonNegInt,
    reviewsTarget: NonNegInt,
    readingMinDone: NonNegInt,
    readingMinTarget: NonNegInt,
    met: z.boolean(),
  }),
  /**
   * T84 (v2): Today's rings, computed by the SAME `goalRings` the Today card
   * uses (outer reviews · middle reading · inner quest, null on a quest-less
   * day) and the graded flame — the widget only draws them, never recomputes.
   */
  rings: z.strictObject({
    reviews: z.number().min(0).max(1),
    reading: z.number().min(0).max(1),
    quest: z.number().min(0).max(1).nullable(),
  }),
  flame: z.enum(['none', 'started', 'one', 'two', 'all']),
  continueReading: z
    .strictObject({ packId: z.string(), storyId: z.string(), title: z.string() })
    .nullable(),
  updatedAtMs: z.number().int(),
});

export type WidgetSnapshot = z.infer<typeof WidgetSnapshotSchema>;

export interface BuildWidgetSnapshotInput {
  streak: number;
  dueCount: number;
  reviewsDone: number;
  /** Today's reading time in milliseconds (floored to whole minutes in the snapshot). */
  readingMs: number;
  goal: { reviews: number; readingMin: number };
  goalMet: boolean;
  /** Today's quest (T34), or null on a quest-less day. */
  quest: { progress: number; target: number; complete: boolean } | null;
  continueReading: { packId: string; storyId: string; title: string } | null;
  /** Epoch ms the snapshot is built for (also its `updatedAtMs`). */
  now: number;
}

const nonNeg = (n: number) => Math.max(0, Math.trunc(n));

/** Builds and Zod-validates a snapshot; throws on malformed input (a programming error). */
export function buildWidgetSnapshot(input: BuildWidgetSnapshotInput): WidgetSnapshot {
  const ringInput = {
    reviewsDone: nonNeg(input.reviewsDone),
    reviewsTarget: nonNeg(input.goal.reviews),
    readingMs: nonNeg(input.readingMs),
    readingMinTarget: nonNeg(input.goal.readingMin),
    quest: input.quest,
  };
  return WidgetSnapshotSchema.parse({
    v: WIDGET_SNAPSHOT_VERSION,
    streak: nonNeg(input.streak),
    dueCount: nonNeg(input.dueCount),
    goal: {
      reviewsDone: nonNeg(input.reviewsDone),
      reviewsTarget: nonNeg(input.goal.reviews),
      readingMinDone: nonNeg(Math.floor(input.readingMs / 60_000)),
      readingMinTarget: nonNeg(input.goal.readingMin),
      met: input.goalMet,
    },
    rings: goalRings(ringInput),
    flame: flameTier(ringInput),
    continueReading: input.continueReading,
    updatedAtMs: Math.trunc(input.now),
  });
}

/** True when the snapshot is more than WIDGET_STALE_MS old (strictly: exactly 36 h is fresh). */
export function isStale(s: WidgetSnapshot, now: number): boolean {
  return now - s.updatedAtMs > WIDGET_STALE_MS;
}
