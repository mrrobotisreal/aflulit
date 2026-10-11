import { describe, expect, it } from 'vitest';

import { createTestDb } from '@/db/__tests__/helpers';
import { createRepositories } from '@/db/repositories';
import { audioTracks, encounters, wordStamps } from '@/db/schema';

import { flagListeningAudio, readAudioFlags } from '../listening/audio-flags';
import { resolveListeningAudio } from '../listening/audio-source';
import { gradeListening } from '../listening/grading';
import { buildListeningItemForCard, collectKnownForms } from '../listening/session';
import { listeningOutcomeToRating } from '../../mapping';
import { Rating } from 'ts-fsrs';
import { seedStory } from './seed';

/** T81: the answer key is the form Mitch banked. «ужасная … ужасно» share lemma «ужасный». */
async function setup(bank: {
  surface: string;
  tokenIndex?: number;
  omitToken?: boolean;
  unread?: boolean;
}) {
  const db = createTestDb();
  const repos = createRepositories(db);
  await seedStory(db, {
    packId: 'p1',
    storyId: 'st1',
    sentences: [
      {
        id: 's0',
        ru: 'Ужасная ночь ужасно тихая',
        en: 'A terrible night, terribly quiet',
        lemmas: ['ужасный', 'ночь', 'ужасный', 'тихий'],
      },
    ],
  });
  await db.insert(audioTracks).values({
    packId: 'p1',
    storyId: 'st1',
    id: 'tr1',
    voice: 'v',
    style: 'neutral',
    file: 'a.opus',
    localUri: 'file:///a.opus',
    durationMs: 5000,
  });
  await db.insert(wordStamps).values(
    [0, 1, 2, 3].map((i) => ({
      packId: 'p1',
      storyId: 'st1',
      trackId: 'tr1',
      stampIndex: i,
      sentenceId: 's0',
      tokenIndex: i,
      startMs: i * 700,
      endMs: i * 700 + 600,
    })),
  );
  const { item } = await repos.bank.addWord({
    lemma: 'ужасный',
    surface: bank.surface,
    translation: 'terrible',
    sentenceId: 's0',
    sourceStoryId: 'st1',
    ...(bank.omitToken ? {} : { tokenIndex: bank.tokenIndex }),
  });
  if (!bank.unread) await repos.reading.markFinished('p1', 'st1');
  return { db, repos, item };
}

describe('T81 resolver order', () => {
  it('keys the encounter token (tokenIndex) even when it is the second lemma match', async () => {
    const { repos, item } = await setup({ surface: 'ужасно', tokenIndex: 2 });
    const audio = await resolveListeningAudio(repos, item);
    expect(audio).toMatchObject({ kind: 'segment', keySource: 'encounter', spokenText: 'ужасно' });
  });

  it('legacy item (no token_index) keys by surface fold, not the first lemma match', async () => {
    const { repos, item } = await setup({ surface: 'Ужасно', omitToken: true });
    const audio = await resolveListeningAudio(repos, item);
    expect(audio).toMatchObject({ keySource: 'surface', spokenText: 'ужасно' });
  });

  it('falls back to the first lemma match when neither token nor surface matches', async () => {
    const { repos, item } = await setup({ surface: 'ужасному', omitToken: true });
    const audio = await resolveListeningAudio(repos, item);
    expect(audio).toMatchObject({ keySource: 'lemma', spokenText: 'Ужасная' });
  });

  it('a stale token_index that points at a different word is ignored', async () => {
    const { repos, item } = await setup({ surface: 'ужасно', tokenIndex: 1 });
    const audio = await resolveListeningAudio(repos, item);
    expect(audio).toMatchObject({ keySource: 'surface', spokenText: 'ужасно' });
  });

  it('records token_index only alongside a sentence', async () => {
    const { db } = await setup({ surface: 'ужасно', tokenIndex: 2 });
    const rows = await db.select().from(encounters);
    expect(rows[0]!.tokenIndex).toBe(2);
  });
});

describe('T81 TTS fallback + flag', () => {
  it('unread story: TTS speaks the banked surface, not the lemma', async () => {
    const { repos, item } = await setup({ surface: 'ужасно', tokenIndex: 2, unread: true });
    const audio = await resolveListeningAudio(repos, item);
    expect(audio).toEqual({ kind: 'tts', keySource: 'tts', text: 'ужасно' });
  });

  it('«Неверный звук?» flag forces TTS until the pack version changes', async () => {
    const { repos, db, item } = await setup({ surface: 'ужасно', tokenIndex: 2 });
    const seg = await resolveListeningAudio(repos, item);
    expect(seg.kind).toBe('segment');
    if (seg.kind !== 'segment') return;
    await flagListeningAudio(repos, item.id, seg.ref);
    expect((await readAudioFlags(repos))[item.id]).toMatchObject({
      packId: 'p1',
      sentenceId: 's0',
      tokenIndex: 2,
      trackId: 'tr1',
      packVersion: 1,
    });
    expect(await resolveListeningAudio(repos, item)).toMatchObject({ kind: 'tts', flagged: true });
    const { packs } = await import('@/db/schema');
    await db.update(packs).set({ version: 2 });
    expect((await resolveListeningAudio(repos, item)).kind).toBe('segment');
  });
});

describe('T81 gradeListening', () => {
  const forms = ['ужасный', 'ужасная', 'ужасно'];
  it('exact / form / wrong', () => {
    expect(gradeListening('Ужасно', 'ужасно', forms)).toBe('exact');
    expect(gradeListening('ужасная', 'ужасно', forms)).toBe('form');
    expect(gradeListening('ужасный', 'ужасно', forms)).toBe('form');
    expect(gradeListening('ночь', 'ужасно', forms)).toBe('wrong');
    expect(gradeListening('  ', 'ужасно', forms)).toBe('wrong');
  });
  it('form is correct but FSRS-capped at Hard; wrong is Again', () => {
    const base = { variant: 'typed' as const, replays: 0, slowReplays: 0, durationMs: 1000 };
    expect(listeningOutcomeToRating({ ...base, correct: true, match: 'exact' })).toBe(Rating.Good);
    expect(listeningOutcomeToRating({ ...base, correct: true, match: 'form' })).toBe(Rating.Hard);
    expect(listeningOutcomeToRating({ ...base, correct: false, match: 'wrong' })).toBe(
      Rating.Again,
    );
  });
  it('collectKnownForms gathers lemma, banked surface and pack forms', async () => {
    const { repos, item } = await setup({ surface: 'ужасно', tokenIndex: 2 });
    const known = await collectKnownForms(repos, item);
    expect(known).toEqual(expect.arrayContaining(['ужасный', 'ужасно', 'ужасная']));
  });
});

describe('T81 distractor rule', () => {
  it('never offers another form of the answer lemma', async () => {
    const { repos, item } = await setup({ surface: 'ужасно', tokenIndex: 2 });
    // lemma_norm is unique, so a sibling can only arrive mis-lemmatized: lemma «ужасная», surface «ужасная».
    await repos.bank.addWord({ lemma: 'ужасная', surface: 'ужасная', translation: 'dup' });
    for (const w of ['стол', 'окно', 'река', 'лес']) {
      await repos.bank.addWord({ lemma: w, surface: w, translation: w });
    }
    const card = (await repos.reviews.getCard(item.id, 'listening'))!;
    const entry = await buildListeningItemForCard(repos, card, item, 'pick4');
    expect(entry.variant).toBe('pick4');
    expect(entry.choices).not.toContain('ужасная');
    expect(entry.choices).toContain('ужасно');
  });
});
