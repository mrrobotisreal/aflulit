import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * T11: syncd is plain HTTP on the tailnet, and Android refuses cleartext on a
 * release build unless the manifest says otherwise. The config plugin is the
 * only place that flag can live (android/ is generated), so pin that it stays
 * registered and that it sets exactly the attribute we rely on.
 */
const APP_JSON = resolve(__dirname, '../../../../app.json') as string;
const PLUGIN = resolve(__dirname, '../../../../plugins/with-tailnet-cleartext.js') as string;

describe('tailnet cleartext config plugin (T11)', () => {
  it('is registered in app.json beside the release-signing plugin', () => {
    const app = JSON.parse(readFileSync(APP_JSON, 'utf8')) as {
      expo: { plugins: (string | [string, unknown])[] };
    };
    const names = app.expo.plugins.map((p) => (Array.isArray(p) ? p[0] : p));
    expect(names).toContain('./plugins/with-release-signing.js');
    expect(names).toContain('./plugins/with-tailnet-cleartext.js');
  });

  it('sets android:usesCleartextTraffic="true" on the <application> element', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const withTailnetCleartext = require(PLUGIN) as (c: unknown) => unknown;
    // Minimal stand-in for expo/config-plugins: run the single mod inline.
    const manifest = { manifest: { application: [{ $: { 'android:name': '.MainApplication' } }] } };
    const mods: Record<string, (c: { modResults: typeof manifest }) => unknown> = {};
    const fakeConfig = {
      name: 'x',
      slug: 'x',
      mods: {
        android: {
          manifest: (c: { modResults: typeof manifest }) => c,
        },
      },
    };
    const out = withTailnetCleartext(fakeConfig) as {
      mods: { android: { manifest: (c: { modResults: typeof manifest }) => unknown } };
    };
    mods.manifest = out.mods.android.manifest;
    mods.manifest({ modResults: manifest });
    const attrs = manifest.manifest.application[0]!.$ as Record<string, string>;
    expect(attrs['android:usesCleartextTraffic']).toBe('true');
    expect(attrs['android:name']).toBe('.MainApplication');
  });
});
