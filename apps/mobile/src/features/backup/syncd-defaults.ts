/**
 * Build-time syncd defaults (Mitch, 2026-10-13). Aflulit is a single-user
 * app, so the home-server host and bearer token are baked into the bundle
 * rather than typed on the phone:
 *
 * - the host is AflulitAPI behind a Cloudflare Tunnel — HTTPS, public DNS,
 *   no VPN/Tailscale involved (AflulitAPI deploy/README.md);
 * - the token comes from `Aflulit/.env` `EXPO_PUBLIC_SYNCD_TOKEN`, which
 *   babel-preset-expo inlines at bundle time. The `.env` file is gitignored;
 *   only the built APK carries the value.
 *
 * `syncd-config.ts` uses these whenever nothing has been saved in Settings,
 * so a fresh install backs up to the home server out of the box; a saved
 * host or token still overrides them (same precedence as before).
 */
export const DEFAULT_SYNCD_HOST = 'https://aflulit.creatv.dev';

/** Null when the bundle was built without `EXPO_PUBLIC_SYNCD_TOKEN` in `.env`. */
export function builtInSyncdToken(): string | null {
  const raw = process.env.EXPO_PUBLIC_SYNCD_TOKEN;
  const token = typeof raw === 'string' ? raw.trim() : '';
  return token.length >= 16 ? token : null;
}
