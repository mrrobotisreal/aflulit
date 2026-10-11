import type { Repositories } from '@/db/repositories';
import { SETTING_KEYS } from '@/db/repositories/settings';

/**
 * «Неверный звук?» flags (T81). One tap after an answer records which clip
 * sounded wrong; that bank item then speaks TTS of its banked surface until
 * the pack version changes (a re-stamped / re-voiced pack gets a fresh
 * chance). Stored as one settings JSON (ids/numbers only — never user text),
 * so a CT session can read the durable list and the backup carries it.
 */
export interface AudioFlag {
  packId: string;
  packVersion: number;
  sentenceId: string;
  tokenIndex: number;
  trackId: string;
  flaggedAt: number;
}

export type AudioFlagMap = Record<string, AudioFlag>;

function isFlag(v: unknown): v is AudioFlag {
  if (!v || typeof v !== 'object') return false;
  const f = v as Record<string, unknown>;
  return (
    typeof f.packId === 'string' &&
    typeof f.packVersion === 'number' &&
    typeof f.sentenceId === 'string' &&
    typeof f.tokenIndex === 'number' &&
    typeof f.trackId === 'string' &&
    typeof f.flaggedAt === 'number'
  );
}

/** Defensive read: a corrupt value heals to no flags. */
export async function readAudioFlags(repos: Repositories): Promise<AudioFlagMap> {
  const raw = await repos.settings.get<unknown>(SETTING_KEYS.listeningAudioFlags);
  if (!raw || typeof raw !== 'object') return {};
  const out: AudioFlagMap = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (isFlag(v)) out[id] = v;
  }
  return out;
}

export async function flagListeningAudio(
  repos: Repositories,
  bankItemId: string,
  ref: Omit<AudioFlag, 'packVersion' | 'flaggedAt'>,
  now = Date.now(),
): Promise<AudioFlag> {
  const pack = await repos.content.getPack(ref.packId);
  const flag: AudioFlag = { ...ref, packVersion: pack?.version ?? 0, flaggedAt: now };
  const flags = await readAudioFlags(repos);
  flags[bankItemId] = flag;
  await repos.settings.set(SETTING_KEYS.listeningAudioFlags, flags);
  return flag;
}

/** True while a flag exists for this item and the pack is still at the flagged version. */
export function isFlagActive(flag: AudioFlag | undefined, currentPackVersion: number): boolean {
  return !!flag && flag.packVersion === currentPackVersion;
}
