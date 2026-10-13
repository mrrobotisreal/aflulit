import { normalizeRu } from '@/db/normalize';
import { foldForAnswer } from '@/lib/text';

import type { BankItemRow } from '@/db/repositories/bank';
import type { Repositories } from '@/db/repositories';

import { sliceWindowSpan } from '@/features/audio/slice-span';
import type { SliceStamp } from '@/features/audio/slice-window';

import { headword } from '../../session';
import { sentenceEligible } from '../sentence-source';
import { isFlagActive, readAudioFlags } from './audio-flags';

/**
 * T22: the T02 fixture pack ships a deliberately SILENT narration track
 * («Стук в стене» — fabricated word stamps over silence, built for karaoke
 * plumbing tests before real audio existed). A listening-quiz segment
 * sliced from it plays nothing, which reads as a broken question. Skip it
 * here (TTS fallback takes over); the reader's narration bar still plays
 * it, where the silence is at least attributable.
 */
const SILENT_FIXTURE_TRACKS = new Set(['a1-creepypasta-001:knock-anton-creepy']);

/**
 * Audio-source selection for the listening quiz (T14 work item 4; the same
 * "pack segment with valid timestamps → use it; else → TTS" rule the reader
 * popup speaker applies via T10's WordSegmentPlayer). This standalone
 * resolver works outside the reader: given only a bank item, it walks
 * source sentence → downloaded audio track → word stamp, and falls back to
 * on-device TTS (Piper via the SpeechService, which itself degrades to the
 * system voice) whenever any link is missing. It never fails — every bank
 * item is speakable.
 */
export type ListeningAudio =
  | {
      kind: 'segment';
      /** T81: which rule picked the keyed token — the banked occurrence, a surface match, or the first lemma match. */
      keySource: 'encounter' | 'surface' | 'lemma';
      /** T81: content ids of the keyed token (flag payload; slugs, never user text). */
      ref: { packId: string; sentenceId: string; tokenIndex: number; trackId: string };
      /** Local file uri of the narration track (audio_tracks.localUri). */
      uri: string;
      startMs: number;
      endMs: number;
      /** The surface form the narrator actually says in this slice. */
      spokenText: string;
      /** T79: the stamps either side of the word in the same track (null at a track edge). */
      prev: SliceStamp | null;
      next: SliceStamp | null;
      /** T79: the whole source sentence's span + outside neighbours («▶ в предложении»). */
      context: {
        startMs: number;
        endMs: number;
        prev: SliceStamp | null;
        next: SliceStamp | null;
        /** Sentence tokens for the post-answer highlight. */
        tokens: { text: string; spaceBefore: boolean; isPunct: boolean; isTarget: boolean }[];
      } | null;
    }
  | {
      kind: 'tts';
      keySource: 'tts';
      /** What the TTS engine should say: the BANKED surface (T81), never the lemma. */
      text: string;
      /** T81: true when a «Неверный звук?» flag (still valid for this pack version) forced TTS. */
      flagged?: boolean;
    };

/** The Russian a listener is expected to hear — the quiz answer key. */
export function spokenText(audio: ListeningAudio): string {
  return audio.kind === 'segment' ? audio.spokenText : audio.text;
}

/**
 * Resolve the best audio source for a bank item. Segment path requires:
 * a word item with a source sentence the T13 sentence-sourcing rules allow
 * (read story / scrolled-past sentence, unless `unseenAllowed`), a
 * downloaded track for that story, and a word stamp covering the lemma's
 * token in that sentence. Phrases go straight to TTS (bank phrases don't
 * record a token span, so a reliable multi-word slice can't be
 * reconstructed — recorded T14 deviation). Ineligible/unstamped sources
 * fall back to TTS — the item always stays playable.
 */
export async function resolveListeningAudio(
  repos: Repositories,
  item: BankItemRow,
  opts: { unseenAllowed?: boolean } = {},
): Promise<ListeningAudio> {
  const { unseenAllowed = false } = opts;
  // T81: TTS speaks what Mitch banked (the surface), so heard = banked. The
  // lemma is only the last resort when a surface is missing.
  const fallback: ListeningAudio = {
    kind: 'tts',
    keySource: 'tts',
    text: item.surface.trim() || headword(item),
  };
  if (item.kind !== 'word' || !item.lemma || !item.sourceSentenceId) return fallback;

  const resolved = await repos.content.resolveSentence(item.sourceSentenceId);
  if (!resolved) return fallback;
  const { packId, storyId, id: sentenceId } = resolved.sentence;

  // T81 «Неверный звук?»: a flag holds only while the pack is at the flagged version.
  const flag = (await readAudioFlags(repos))[item.id];
  if (flag) {
    const pack = await repos.content.getPack(packId);
    if (isFlagActive(flag, pack?.version ?? 0))
      return { ...fallback, flagged: true } as ListeningAudio;
  }

  // T14 ticket: listening items sourced from stories respect the T13
  // unseen-stories toggle too (a one-entry ReadIndex feeds the shared rule).
  if (!unseenAllowed) {
    const progress = await repos.reading.getProgress(packId, storyId);
    const index = {
      progress: new Map(progress ? [[`${packId}:${storyId}`, progress]] : []),
      storyLevel: new Map(),
    };
    if (!sentenceEligible(resolved.sentence, index, false)) return fallback;
  }

  const tracks = (await repos.content.listAudioTracksForPack(packId)).filter(
    (t) =>
      t.storyId === storyId &&
      t.localUri != null &&
      !SILENT_FIXTURE_TRACKS.has(`${packId}:${t.id}`),
  );
  if (tracks.length === 0) return fallback;

  const tokens = await repos.content.getSentenceTokens(packId, sentenceId);
  const norm = normalizeRu(item.lemma);
  const picked = await pickTargetToken(repos, item, sentenceId, tokens, norm);
  if (!picked) return fallback;
  const { target, keySource } = picked;

  for (const track of tracks) {
    const stamps = await repos.content.getWordStamps(packId, storyId, track.id);
    const sorted = [...stamps].sort((a, b) => a.startMs - b.startMs);
    const stamp = sorted.find(
      (s) => s.sentenceId === sentenceId && s.tokenIndex === target.tokenIndex,
    );
    if (stamp && stamp.endMs > stamp.startMs) {
      const at = sorted.indexOf(stamp);
      const sentenceSpan = sliceWindowSpan(sorted, (s) => s.sentenceId === sentenceId);
      return {
        kind: 'segment',
        keySource,
        ref: { packId, sentenceId, tokenIndex: target.tokenIndex, trackId: track.id },
        uri: track.localUri!,
        startMs: stamp.startMs,
        endMs: stamp.endMs,
        spokenText: target.text,
        prev: sorted[at - 1]
          ? { startMs: sorted[at - 1]!.startMs, endMs: sorted[at - 1]!.endMs }
          : null,
        next: sorted[at + 1]
          ? { startMs: sorted[at + 1]!.startMs, endMs: sorted[at + 1]!.endMs }
          : null,
        context: sentenceSpan
          ? {
              ...sentenceSpan,
              tokens: tokens.map((t) => ({
                text: t.text,
                spaceBefore: t.spaceBefore,
                isPunct: t.isPunct,
                isTarget: t.tokenIndex === target.tokenIndex,
              })),
            }
          : null,
      };
    }
  }
  return fallback;
}

type SentenceToken = Awaited<ReturnType<Repositories['content']['getSentenceTokens']>>[number];

/**
 * T81 resolver order — the key must be the form Mitch banked:
 * 1. the source encounter's `(sentenceId, tokenIndex)` (the oldest one in the
 *    item's source sentence), if that token still reads as this word;
 * 2. a token whose surface folds equal to `item.surface` (backfill for items
 *    banked before `token_index` existed);
 * 3. the first token with the item's lemma (the pre-T81 behaviour).
 */
export async function pickTargetToken(
  repos: Repositories,
  item: BankItemRow,
  sentenceId: string,
  tokens: SentenceToken[],
  lemmaNorm: string,
): Promise<{ target: SentenceToken; keySource: 'encounter' | 'surface' | 'lemma' } | null> {
  const words = tokens.filter((t) => !t.isPunct);
  const surfaceFold = foldForAnswer(item.surface);

  const withEnc = await repos.bank.getItemWithEncounters(item.id);
  const source = (withEnc?.encounters ?? [])
    .filter((e) => e.sentenceId === sentenceId && e.tokenIndex != null)
    .sort((a, b) => a.createdAt - b.createdAt)[0];
  if (source) {
    const t = words.find((w) => w.tokenIndex === source.tokenIndex);
    if (
      t &&
      (t.lemmaNorm === lemmaNorm || foldForAnswer(t.text) === foldForAnswer(source.surface))
    ) {
      return { target: t, keySource: 'encounter' };
    }
  }
  const bySurface = words.find(
    (t) => foldForAnswer(t.text) === surfaceFold && (t.lemmaNorm === lemmaNorm || !t.lemmaNorm),
  );
  if (bySurface) return { target: bySurface, keySource: 'surface' };
  const byLemma = words.find((t) => t.lemmaNorm === lemmaNorm);
  return byLemma ? { target: byLemma, keySource: 'lemma' } : null;
}
