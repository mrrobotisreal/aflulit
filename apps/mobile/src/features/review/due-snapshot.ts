import type { Repositories } from '@/db/repositories';
import { SETTING_KEYS } from '@/db/repositories/settings';
import { UNIFIED_SESSION_DIRECTIONS } from '@/db/repositories/reviews';
import { localDateKey } from '@/db/repositories/stats';
import { track } from '@/services/analytics';

/**
 * T82: once per local day, record how big the queue is — `due_snapshot
 * { reviewDue, newBacklog, learning, overdue7d }` — so the trend is visible
 * later without anyone having to open the sheet that day.
 */
export async function trackDueSnapshotOnce(
  repos: Repositories,
  now = Date.now(),
): Promise<boolean> {
  const day = localDateKey(new Date(now));
  if ((await repos.settings.get<string>(SETTING_KEYS.dueSnapshotDay)) === day) return false;
  const plan = await repos.reviews.countDueBreakdown({
    now,
    directions: UNIFIED_SESSION_DIRECTIONS,
  });
  track('due_snapshot', {
    reviewDue: plan.reviewDue,
    newBacklog: plan.newBacklog,
    learning: plan.learning,
    overdue7d: plan.overdue7d,
  });
  await repos.settings.set(SETTING_KEYS.dueSnapshotDay, day);
  return true;
}
