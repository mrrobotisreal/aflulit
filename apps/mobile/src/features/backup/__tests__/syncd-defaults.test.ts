import { afterEach, describe, expect, it, vi } from 'vitest';

import { builtInSyncdToken, DEFAULT_SYNCD_HOST } from '../syncd-defaults';

/**
 * Build-time syncd defaults (2026-10-13): the Cloudflare-tunnel host is a
 * constant; the token is whatever `EXPO_PUBLIC_SYNCD_TOKEN` was at bundle
 * time, or null when the bundle was built without `.env`.
 */
afterEach(() => vi.unstubAllEnvs());

describe('syncd build-time defaults', () => {
  it('points at the HTTPS Cloudflare-tunnel host, not a tailnet name', () => {
    expect(DEFAULT_SYNCD_HOST).toBe('https://aflulit.creatv.dev');
    expect(DEFAULT_SYNCD_HOST.startsWith('https://')).toBe(true);
  });

  it('exposes the baked token only when it is present and plausible', () => {
    vi.stubEnv('EXPO_PUBLIC_SYNCD_TOKEN', '  0123456789abcdef0123456789abcdef  ');
    expect(builtInSyncdToken()).toBe('0123456789abcdef0123456789abcdef');
    vi.stubEnv('EXPO_PUBLIC_SYNCD_TOKEN', 'short');
    expect(builtInSyncdToken()).toBeNull(); // syncd refuses tokens < 16 chars
    vi.stubEnv('EXPO_PUBLIC_SYNCD_TOKEN', '');
    expect(builtInSyncdToken()).toBeNull();
  });
});
