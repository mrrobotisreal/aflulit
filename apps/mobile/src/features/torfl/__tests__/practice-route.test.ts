import { ExamSchema, type Exam } from '@aflulit/schema';
import examPackJson from '@aflulit/schema/fixtures/packs/a1-exam-fixture/pack.json';
import { describe, expect, it } from 'vitest';

import { practiceRouteFor } from '../practice-route';

/** ISS-004 (T77): speaking / writing-only drill sets route to their practice surface. */
const base = ExamSchema.parse(
  (examPackJson as unknown as { exams: unknown[] }).exams.find(
    (e) => (e as { id: string }).id === 'a1-mock-fx',
  ),
) as Exam;

function only(kind: 'speaking' | 'writing', itemKind: string): Exam {
  const st = base.subtests.find((s) => s.kind === kind)!;
  const part = st.parts.find((p) => p.items.some((i) => i.kind === itemKind))!;
  return {
    ...base,
    mode: 'drill',
    subtests: [
      { ...st, parts: [{ ...part, items: part.items.filter((i) => i.kind === itemKind) }] },
    ],
  } as Exam;
}

describe('practiceRouteFor (ISS-004)', () => {
  it('a mock with objective items keeps the drill runner (null)', () => {
    expect(practiceRouteFor(base, 'p')).toBeNull();
    const lex = { ...base, subtests: base.subtests.filter((s) => s.kind === 'lexgram') } as Exam;
    expect(practiceRouteFor(lex, 'p')).toBeNull();
  });

  it('replies / situations -> /torfl/speak on the first item', () => {
    const r = practiceRouteFor(only('speaking', 'speaking-reply'), 'pk')!;
    expect(r.pathname).toBe('/torfl/speak');
    expect((r as { params: { packId: string; itemId: string } }).params.packId).toBe('pk');
    const s = practiceRouteFor(only('speaking', 'speaking-situation'), 'pk')!;
    expect(s.pathname).toBe('/torfl/speak');
  });

  it('monologues -> Билеты', () => {
    expect(practiceRouteFor(only('speaking', 'speaking-monologue'), 'pk')!.pathname).toBe(
      '/torfl/tickets',
    );
  });

  it('letters -> /torfl/writing', () => {
    expect(practiceRouteFor(only('writing', 'writing'), 'pk')!.pathname).toBe('/torfl/writing');
  });
});
