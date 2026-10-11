import { foldForAnswer } from '@/lib/text';

/**
 * T81 form-tolerant listening grading (pure).
 * - `exact`: folds equal to the heard/keyed form (today's rule: ё/е, case, stress).
 * - `form`: not the keyed form, but the lemma or another known surface form of
 *   the SAME lemma («Почти — та же лексема, другая форма»). Counts as correct
 *   for FSRS with a Hard cap (default; Mitch's call pending, recorded in T81).
 * - `wrong`: anything else.
 */
export type ListeningMatch = 'exact' | 'form' | 'wrong';

export function gradeListening(
  answer: string,
  key: string,
  /** Folded or raw other forms of the keyed word's lemma (lemma, encounter surfaces, pack token forms). */
  knownForms: readonly string[],
): ListeningMatch {
  const a = foldForAnswer(answer);
  if (!a) return 'wrong';
  if (a === foldForAnswer(key)) return 'exact';
  return knownForms.some((f) => foldForAnswer(f) === a) ? 'form' : 'wrong';
}
