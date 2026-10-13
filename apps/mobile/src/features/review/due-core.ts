import { z } from 'zod';

/**
 * T82 — the pure "what is due" core. No DB, no React: the reviews repo loads
 * candidate cards, this module decides which of them are today's queue and how
 * the headline number splits. Every consumer (Today, widget, notifications,
 * games menu, every session builder) goes through it, so the numbers agree by
 * construction.
 *
 * Vocabulary: a *review* is any due card of a word Mitch has already started
 * (including a sibling direction of an introduced word). A *new word* is a bank
 * item with no review ever. The daily budget counts new WORDS.
 */

export const NEW_PER_DAY_DEFAULT = 10;
export const NEW_PER_DAY_MIN = 0;
export const NEW_PER_DAY_MAX = 50;

export const QueuePrefsSchema = z.strictObject({
  v: z.literal(1),
  newPerDay: z.number().int().min(NEW_PER_DAY_MIN).max(NEW_PER_DAY_MAX),
  buryRelated: z.boolean(),
});
export type QueuePrefs = z.infer<typeof QueuePrefsSchema>;

export const DEFAULT_QUEUE_PREFS: QueuePrefs = {
  v: 1,
  newPerDay: NEW_PER_DAY_DEFAULT,
  buryRelated: true,
};

/** Stored value → valid prefs; anything corrupt heals field-by-field to defaults. */
export function parseQueuePrefs(raw: unknown): QueuePrefs {
  const whole = QueuePrefsSchema.safeParse(raw);
  if (whole.success) return whole.data;
  const o = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const n = QueuePrefsSchema.shape.newPerDay.safeParse(o.newPerDay);
  const b = QueuePrefsSchema.shape.buryRelated.safeParse(o.buryRelated);
  return {
    v: 1,
    newPerDay: n.success ? n.data : DEFAULT_QUEUE_PREFS.newPerDay,
    buryRelated: b.success ? b.data : DEFAULT_QUEUE_PREFS.buryRelated,
  };
}

export function clampNewPerDay(value: number): number {
  if (!Number.isFinite(value)) return NEW_PER_DAY_DEFAULT;
  return Math.min(NEW_PER_DAY_MAX, Math.max(NEW_PER_DAY_MIN, Math.round(value)));
}

export type DueSource = 'reader' | 'topic' | 'scenario' | 'journal' | 'manual' | 'unknown';

/** Where a bank item came from, from the columns it already carries (no schema change). */
export function classifySource(item: {
  sourceStoryId: string | null;
  sourceSentenceId: string | null;
  hasJournalEncounter: boolean;
}): DueSource {
  if (item.sourceStoryId?.startsWith('lx-')) return 'topic';
  if (item.sourceSentenceId) return 'reader';
  if (item.sourceStoryId) return 'scenario';
  if (item.hasJournalEncounter) return 'journal';
  return 'manual';
}

/** One due, servable card as the repo loads it. */
export interface DueCandidate {
  id: string;
  bankItemId: string;
  direction: string;
  /** ts-fsrs State: 0 New · 1 Learning · 2 Review · 3 Relearning. */
  state: number;
  dueAt: number;
  createdAt: number;
  /** The item has been reviewed at least once on some direction (review_log). */
  introduced: boolean;
  /** The item has a gloss — without one only the listening card can be served. */
  hasGloss: boolean;
  /** THIS card has a review_log row in the local day of `now`. */
  reviewedToday: boolean;
  /** ANOTHER card of the same item has one — the sibling-bury trigger. */
  siblingReviewedToday: boolean;
  source: DueSource;
}

export interface PlanInput {
  candidates: DueCandidate[];
  now: number;
  /** Distinct words whose first-ever review falls in `now`'s local day. */
  newWordsUsedToday: number;
  prefs: QueuePrefs;
  /** Direction preference order when a new word is introduced as a single card. */
  directionOrder: readonly string[];
}

export interface DuePlan {
  /** Reviews first (most overdue first), then today's new words (bank order). */
  queue: DueCandidate[];
  reviewDue: number;
  /** Cards the queue serves for new words today. */
  newToday: number;
  newTodayWords: number;
  newBudgetLeft: number;
  /** New words beyond today's budget — shown apart, never in the headline. */
  newBacklog: number;
  newAvailable: number;
  /** reviewDue + newToday. */
  total: number;
  /** Learning + Relearning cards among the reviews. */
  learning: number;
  byState: Record<'new' | 'learning' | 'review' | 'relearning', number>;
  byDirection: Record<string, number>;
  bySource: Record<DueSource, number>;
  /** Review cards by days overdue: 0 (due today), 1-2, 3-7, 8-30, 31+. */
  overdue: { today: number; d1to2: number; d3to7: number; d8to30: number; d31plus: number };
  /** Reviews overdue by more than 7 days. */
  overdue7d: number;
}

const STATE_KEYS = ['new', 'learning', 'review', 'relearning'] as const;
const DAY_MS = 86_400_000;

function dirRank(order: readonly string[], c: DueCandidate): number {
  // A gloss-less word can only be served as listening (T06 rule): introduce it so.
  if (!c.hasGloss) return c.direction === 'listening' ? -1 : order.length;
  const i = order.indexOf(c.direction);
  return i === -1 ? order.length : i;
}

/** Keep one card per bank item (the first in the given order). */
function onePerItem<T extends { bankItemId: string }>(cards: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const c of cards) {
    if (seen.has(c.bankItemId)) continue;
    seen.add(c.bankItemId);
    out.push(c);
  }
  return out;
}

export function planDue(input: PlanInput): DuePlan {
  const { candidates, now, newWordsUsedToday, prefs, directionOrder } = input;

  // Sibling bury (Anki-style, computed — no writes): once one direction of a
  // word has been answered today, its other directions wait until tomorrow.
  const visible = prefs.buryRelated
    ? candidates.filter((c) => !(c.siblingReviewedToday && !c.reviewedToday))
    : candidates;

  const reviewPool = visible
    .filter((c) => !(c.state === 0 && !c.introduced))
    .sort((a, b) => a.dueAt - b.dueAt || a.id.localeCompare(b.id));
  const reviews = prefs.buryRelated ? onePerItem(reviewPool) : reviewPool;

  // New words: items with no review ever, in bank order (oldest first).
  const reviewedItems = new Set(reviews.map((c) => c.bankItemId));
  const newByItem = new Map<string, DueCandidate[]>();
  for (const c of visible) {
    if (c.state !== 0 || c.introduced) continue;
    // An item already served as a review today can't also be introduced.
    if (reviewedItems.has(c.bankItemId)) continue;
    const list = newByItem.get(c.bankItemId);
    if (list) list.push(c);
    else newByItem.set(c.bankItemId, [c]);
  }
  const newItems = [...newByItem.values()]
    .map((cards) => cards.sort((a, b) => dirRank(directionOrder, a) - dirRank(directionOrder, b)))
    .sort(
      (a, b) =>
        a[0]!.createdAt - b[0]!.createdAt || a[0]!.bankItemId.localeCompare(b[0]!.bankItemId),
    );

  const newBudgetLeft = Math.max(0, prefs.newPerDay - newWordsUsedToday);
  const chosen = newItems.slice(0, newBudgetLeft);
  const newCards = chosen.flatMap((cards) => (prefs.buryRelated ? [cards[0]!] : cards));

  const byState = { new: 0, learning: 0, review: 0, relearning: 0 };
  const byDirection: Record<string, number> = {};
  const bySource: Record<DueSource, number> = {
    reader: 0,
    topic: 0,
    scenario: 0,
    journal: 0,
    manual: 0,
    unknown: 0,
  };
  const overdue = { today: 0, d1to2: 0, d3to7: 0, d8to30: 0, d31plus: 0 };
  let learning = 0;
  for (const c of reviews) {
    byState[STATE_KEYS[c.state] ?? 'review'] += 1;
    if (c.state === 1 || c.state === 3) learning += 1;
    const days = Math.floor((now - c.dueAt) / DAY_MS);
    if (days < 1) overdue.today += 1;
    else if (days <= 2) overdue.d1to2 += 1;
    else if (days <= 7) overdue.d3to7 += 1;
    else if (days <= 30) overdue.d8to30 += 1;
    else overdue.d31plus += 1;
  }
  for (const c of [...reviews, ...newCards]) {
    byDirection[c.direction] = (byDirection[c.direction] ?? 0) + 1;
    bySource[c.source] += 1;
  }
  byState.new += newCards.length;

  return {
    queue: [...reviews, ...newCards],
    reviewDue: reviews.length,
    newToday: newCards.length,
    newTodayWords: chosen.length,
    newBudgetLeft,
    newBacklog: Math.max(0, newItems.length - chosen.length),
    newAvailable: newItems.length,
    total: reviews.length + newCards.length,
    learning,
    byState,
    byDirection,
    bySource,
    overdue,
    overdue7d: reviews.filter((c) => now - c.dueAt > 7 * DAY_MS).length,
  };
}

// ---- copy (pure, tested) ---------------------------------------------------

function plural(n: number, forms: readonly [string, string, string]): string {
  const abs = Math.abs(n);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

/** «30 повторений + 12 новых» — the split under the Today headline. */
export function splitLine(reviewDue: number, newToday: number): string {
  const reviews = `${reviewDue} ${plural(reviewDue, ['повторение', 'повторения', 'повторений'])}`;
  if (newToday === 0) return reviews;
  if (reviewDue === 0) return `${newToday} ${plural(newToday, ['новая', 'новые', 'новых'])}`;
  return `${reviews} + ${newToday} ${plural(newToday, ['новая', 'новые', 'новых'])}`;
}

/** «В очереди: 286 новых» — never part of the headline. */
export function backlogLine(newBacklog: number): string | null {
  return newBacklog > 0 ? `В очереди: ${newBacklog} новых` : null;
}

/** «+87 слов в Словаре · по 10 в день» — the bulk-bank toast. */
export function bulkBankToast(added: number, perDay: number): string {
  if (added === 0) return '+0 слов — все слова уже в Словаре';
  const words = plural(added, ['слово', 'слова', 'слов']);
  return perDay > 0
    ? `+${added} ${words} в Словаре · по ${perDay} в день`
    : `+${added} ${words} в Словаре · новые слова выключены`;
}
