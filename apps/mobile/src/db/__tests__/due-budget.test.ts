import { describe, expect, it } from 'vitest';

import { DEFAULT_QUEUE_PREFS, type QueuePrefs } from '@/features/review/due-core';

import { createRepositories } from '../repositories';
import { Rating } from '../repositories/reviews';
import { createTestDb } from './helpers';

/** T82: the daily new-word budget, reviews-first, sibling bury and the shared count. */

const DAY = 86_400_000;
/** Local noon two days from now — after every seeded card's createdAt, mid-day so ±hours stay in-day. */
const NOON = (() => {
  const d = new Date(Date.now() + 2 * DAY);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0).getTime();
})();
const DIRS = ['ru-en', 'en-ru', 'listening'] as const;
const P = (over: Partial<QueuePrefs> = {}): QueuePrefs => ({ ...DEFAULT_QUEUE_PREFS, ...over });

function setup() {
  return createRepositories(createTestDb());
}

async function bank(repos: ReturnType<typeof setup>, n: number, tag = 'w') {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const { item } = await repos.bank.addWord({
      lemma: `${tag}${i}`,
      surface: `${tag}${i}`,
      translation: `t${i}`,
      level: 'A1',
    });
    ids.push(item.id);
  }
  return ids;
}

describe('headline split', () => {
  it('15 banked words → at most 10 words of new, the rest is backlog', async () => {
    const repos = setup();
    await bank(repos, 15);
    const p = await repos.reviews.countDueBreakdown({
      now: NOON,
      directions: [...DIRS],
      prefs: P(),
    });
    expect(p.reviewDue).toBe(0);
    expect(p.newTodayWords).toBe(10);
    expect(p.newToday).toBe(10); // bury on: one card per word
    expect(p.newBacklog).toBe(5);
    expect(p.total).toBe(10);
  });

  it('bury off: a new word brings all its due directions', async () => {
    const repos = setup();
    await bank(repos, 15);
    const p = await repos.reviews.countDueBreakdown({
      now: NOON,
      directions: [...DIRS],
      prefs: P({ buryRelated: false }),
    });
    expect(p.newTodayWords).toBe(10);
    expect(p.newToday).toBe(30);
  });

  it('a 100-word bulk bank moves only the backlog line, not the headline', async () => {
    const repos = setup();
    await bank(repos, 15);
    const before = await repos.reviews.countDueBreakdown({
      now: NOON,
      directions: [...DIRS],
      prefs: P(),
    });
    await bank(repos, 100, 'bulk');
    const after = await repos.reviews.countDueBreakdown({
      now: NOON,
      directions: [...DIRS],
      prefs: P(),
    });
    expect(after.total).toBe(before.total);
    expect(after.newBacklog).toBe(before.newBacklog + 100);
  });

  it('a budget of 0 introduces nothing', async () => {
    const repos = setup();
    await bank(repos, 5);
    const p = await repos.reviews.countDueBreakdown({
      now: NOON,
      directions: [...DIRS],
      prefs: P({ newPerDay: 0 }),
    });
    expect(p.total).toBe(0);
    expect(p.newBacklog).toBe(5);
  });
});

describe('queue order, budget use and the day boundary', () => {
  it('serves reviews before new words', async () => {
    const repos = setup();
    const [a] = await bank(repos, 1, 'old');
    const card = (await repos.reviews.listCardsForItem(a!)).find((c) => c.direction === 'ru-en')!;
    await repos.reviews.gradeCard(card.id, Rating.Good, { now: NOON - 5 * DAY });
    await bank(repos, 5, 'fresh');
    const q = await repos.reviews.listSessionCards({
      now: NOON + 30 * DAY,
      directions: [...DIRS],
      prefs: P({ buryRelated: false }),
    });
    const firstNewIdx = q.findIndex((c) => c.bankItemId !== a);
    const lastReviewIdx = q.map((c) => c.bankItemId).lastIndexOf(a!);
    expect(lastReviewIdx).toBeLessThan(firstNewIdx);
  });

  it('introducing words today spends the budget; it resets at local midnight', async () => {
    const repos = setup();
    const ids = await bank(repos, 25);
    // Introduce 10 words at noon (first review today).
    for (const id of ids.slice(0, 10)) {
      const c = (await repos.reviews.listCardsForItem(id)).find((x) => x.direction === 'ru-en')!;
      await repos.reviews.gradeCard(c.id, Rating.Good, { now: NOON });
    }
    const sameDay = await repos.reviews.countDueBreakdown({
      now: NOON + 3_600_000,
      directions: [...DIRS],
      prefs: P(),
    });
    expect(sameDay.newBudgetLeft).toBe(0);
    expect(sameDay.newToday).toBe(0);
    expect(sameDay.newBacklog).toBe(15);
    // 23:59 local still the same day; 00:01 next day the budget is back.
    const d = new Date(NOON);
    const late = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59).getTime();
    const early = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 1).getTime();
    expect(
      (await repos.reviews.countDueBreakdown({ now: late, directions: [...DIRS], prefs: P() }))
        .newBudgetLeft,
    ).toBe(0);
    const next = await repos.reviews.countDueBreakdown({
      now: early,
      directions: [...DIRS],
      prefs: P(),
    });
    expect(next.newBudgetLeft).toBe(10);
    expect(next.newTodayWords).toBe(10);
  });

  it('sibling bury: answering one direction hides the word’s other directions that day', async () => {
    const repos = setup();
    const [id] = await bank(repos, 1);
    const cards = await repos.reviews.listCardsForItem(id!);
    const ruen = cards.find((c) => c.direction === 'ru-en')!;
    await repos.reviews.gradeCard(ruen.id, Rating.Again, { now: NOON });
    // Again → relearn soon; later the same day the ru-en card may be due again, siblings are not served.
    const later = NOON + 3_600_000;
    const withBury = await repos.reviews.listSessionCards({
      now: later,
      directions: [...DIRS],
      prefs: P(),
    });
    expect(withBury.every((c) => c.direction === 'ru-en')).toBe(true);
    const noBury = await repos.reviews.listSessionCards({
      now: later,
      directions: [...DIRS],
      prefs: P({ buryRelated: false }),
    });
    expect(noBury.some((c) => c.direction !== 'ru-en')).toBe(true);
    // Next local day the siblings return.
    const tomorrow = NOON + DAY;
    const back = await repos.reviews.listSessionCards({
      now: tomorrow,
      directions: [...DIRS],
      prefs: P(),
    });
    expect(back.length).toBeGreaterThan(0);
  });

  it('suspended and buried cards never count', async () => {
    const repos = setup();
    const ids = await bank(repos, 3);
    const ruen = async (id: string) =>
      (await repos.reviews.listCardsForItem(id)).find((x) => x.direction === 'ru-en')!;
    const c0 = await ruen(ids[0]!);
    const c1 = await ruen(ids[1]!);
    await repos.reviews.suspendCard(c0.id);
    await repos.reviews.buryUntilTomorrow(c1.id, NOON);
    const p = await repos.reviews.countDueBreakdown({
      now: NOON,
      directions: ['ru-en'],
      prefs: P(),
    });
    expect(p.total).toBe(1);
  });

  it('one function feeds every consumer: the count equals the session length', async () => {
    const repos = setup();
    await bank(repos, 30);
    const q = { now: NOON, directions: [...DIRS], prefs: P() };
    const p = await repos.reviews.countDueBreakdown(q);
    const served = await repos.reviews.listSessionCards({ ...q, limit: 1000 });
    expect(served.length).toBe(p.total);
  });
});

describe('breakdown fields', () => {
  it('splits by state, direction, source and overdue age; exam deck is not in cards', async () => {
    const repos = setup();
    const ids = await bank(repos, 4);
    const c = (await repos.reviews.listCardsForItem(ids[0]!)).find((x) => x.direction === 'ru-en')!;
    await repos.reviews.gradeCard(c.id, Rating.Good, { now: NOON - 40 * DAY });
    const p = await repos.reviews.countDueBreakdown({
      now: NOON,
      directions: [...DIRS],
      prefs: P({ buryRelated: false }),
    });
    expect(
      p.overdue.d31plus + p.overdue.d8to30 + p.overdue.d3to7 + p.overdue.d1to2 + p.overdue.today,
    ).toBe(p.reviewDue);
    expect(p.overdue7d).toBeGreaterThanOrEqual(1);
    expect(p.bySource.manual + p.bySource.reader).toBe(p.total);
    expect(Object.values(p.byDirection).reduce((a, b) => a + b, 0)).toBe(p.total);
  });
});
