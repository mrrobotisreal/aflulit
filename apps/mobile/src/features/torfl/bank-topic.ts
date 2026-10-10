import { bulkBankToast, NEW_PER_DAY_DEFAULT } from '@/features/review/due-core';
import { isTorflCategory } from './level-profile';

/**
 * «Добавить все слова в Словарь» (T69, TORFL §5.4) — the pure parts: which
 * stories offer the action, the toast copy, and the analytics topic slug.
 * Generic code gated to the `torfl:lexicon` tag so it never appears on a
 * creepypasta. The write itself is `repos.bank.bankLemmasFromStory`.
 */

export const LEXICON_TAG = 'torfl:lexicon';

/**
 * The reader shows the action only on a TORFL shelf pack tagged `torfl:lexicon`
 * (the A1 lexicon is `torfl`; the A2 lexicon (CT037, `torfl-a2`) banks too).
 */
export function canBankTopic(pack: { category: string | null; tags: readonly string[] }): boolean {
  return isTorflCategory(pack.category) && pack.tags.includes(LEXICON_TAG);
}

/**
 * «+87 слов в Словаре · по 10 в день» / «+0 слов — все слова уже в Словаре».
 * T82: new words join the queue at the daily budget, the toast says so.
 */
export function bankTopicToast(added: number, perDay: number = NEW_PER_DAY_DEFAULT): string {
  return bulkBankToast(added, perDay);
}

/** `torfl_topic_banked.topic` = the story id slug minus the lexicon's `lx-` prefix. */
export function topicSlugOfStory(storyId: string): string {
  return storyId.replace(/^lx-/, '');
}
