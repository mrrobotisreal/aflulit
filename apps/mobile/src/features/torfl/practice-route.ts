import type { Exam } from '@aflulit/schema';

import { torflLevelOf } from './level-profile';
import { ticketHref } from './speaking/tickets-model';

/**
 * ISS-004 (T77): where a drill exam's start button goes when none of its items
 * can run in the objective drill runner. The `sp-*` drill sets hold only
 * speaking / writing items; the T70 runner would open its empty state, so the
 * intro routes to the real practice surface instead:
 *  - replies / situations → `/torfl/speak` on the set's first item,
 *  - monologues → «Билеты»,
 *  - letters / notes → `/torfl/writing` on the set's first item.
 * Returns null for any exam with at least one objective item (the drill runner).
 */
export type PracticeRoute =
  | { pathname: '/torfl/speak'; params: { packId: string; examId: string; itemId: string } }
  | { pathname: '/torfl/writing'; params: { packId: string; examId: string; itemId: string } }
  | ReturnType<typeof ticketHref>;

export function practiceRouteFor(exam: Exam, packId: string): PracticeRoute | null {
  const items = exam.subtests.flatMap((s) => s.parts.flatMap((p) => p.items));
  if (items.length === 0) return null;
  const objective = items.some((i) => i.kind === 'choice' || i.kind === 'typed');
  if (objective) return null;
  const first = items[0]!;
  const params = { packId, examId: exam.id, itemId: first.id };
  switch (first.kind) {
    case 'speaking-reply':
    case 'speaking-situation':
      return { pathname: '/torfl/speak', params };
    case 'speaking-monologue':
      return ticketHref(torflLevelOf(exam.level));
    case 'writing':
      return { pathname: '/torfl/writing', params };
    default:
      return null;
  }
}
