import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_REPO, getRepoConfig, setRepoConfig } from '../config';

/**
 * Content-repo config round trip. Sumrak's legacy-name healing (its content
 * repo was once misspelled) was deleted in Aflulit T01 — the default
 * `mrrobotisreal/aflulit-content` has never had another name.
 */

// vi.mock calls are hoisted above the imports at run time; the store must be
// hoisted with them.
const settingsStore = vi.hoisted(() => new Map<string, unknown>());

vi.mock('@/db', () => ({
  repos: {
    settings: {
      get: vi.fn(async (key: string) => settingsStore.get(key) ?? null),
      set: vi.fn(async (key: string, value: unknown) => {
        settingsStore.set(key, value);
      }),
    },
  },
}));

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
}));

beforeEach(() => {
  settingsStore.clear();
});

describe('getRepoConfig', () => {
  it('passes the correct name through untouched', async () => {
    await setRepoConfig(DEFAULT_REPO);
    const config = await getRepoConfig();
    expect(config).toEqual(DEFAULT_REPO);
  });

  it('still returns null when nothing is stored', async () => {
    expect(await getRepoConfig()).toBeNull();
  });
});
