import * as SecureStore from 'expo-secure-store';
import { z } from 'zod';

import { repos } from '@/db';
import { SETTING_KEYS } from '@/db/repositories/settings';

import { builtInSyncdToken, DEFAULT_SYNCD_HOST } from './syncd-defaults';

/**
 * syncd target configuration (T21). Split by sensitivity, the T07/T20 rule:
 * the host URL (not secret) lives in the settings table and is backed up;
 * a bearer token entered in Settings lives in expo-secure-store ONLY —
 * never the settings table, logs, analytics, or backup payloads.
 *
 * Since 2026-10-13 both have build-time defaults (`syncd-defaults.ts`): the
 * Cloudflare-tunnel host and the token baked in from `.env`. Anything saved
 * on the phone wins over the default; clearing the saved token falls back
 * to the built-in one rather than to "no token".
 */
const TOKEN_STORE_KEY = 'aflulit.backup.syncd.token';

const SyncdConfigSchema = z.strictObject({
  /** Base URL of the service, e.g. "https://aflulit.creatv.dev". */
  host: z.string().min(1),
});
export type SyncdConfig = z.infer<typeof SyncdConfigSchema>;

export { normalizeSyncdHost } from './syncd-client';

export async function getSyncdConfig(): Promise<SyncdConfig | null> {
  const raw = await repos.settings.get<unknown>(SETTING_KEYS.syncdConfig);
  const parsed = SyncdConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : { host: DEFAULT_SYNCD_HOST };
}

/** True when the host in use is the built-in default, not one Mitch saved. */
export async function isSyncdHostDefault(): Promise<boolean> {
  const raw = await repos.settings.get<unknown>(SETTING_KEYS.syncdConfig);
  return !SyncdConfigSchema.safeParse(raw).success;
}

export async function setSyncdConfig(config: SyncdConfig | null): Promise<void> {
  await repos.settings.set(SETTING_KEYS.syncdConfig, config);
}

export async function getSyncdToken(): Promise<string | null> {
  return (await SecureStore.getItemAsync(TOKEN_STORE_KEY)) ?? builtInSyncdToken();
}

/** True when a token was entered in Settings (as opposed to the built-in one). */
export async function hasSavedSyncdToken(): Promise<boolean> {
  return (await SecureStore.getItemAsync(TOKEN_STORE_KEY)) != null;
}

export async function setSyncdToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_STORE_KEY, token);
}

export async function clearSyncdToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_STORE_KEY);
}

export async function hasSyncdToken(): Promise<boolean> {
  return (await getSyncdToken()) != null;
}

/** Host + token both present — the bar for attempting any syncd request. */
export async function isSyncdConfigured(): Promise<boolean> {
  return (await getSyncdConfig()) !== null && (await hasSyncdToken());
}
