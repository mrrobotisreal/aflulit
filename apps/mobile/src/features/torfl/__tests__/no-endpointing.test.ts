import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * T77 guard («you start, you stop»): the M17 endpointer (6 s no-speech / 1.6 s
 * trailing-silence stops) must never be reachable from a TORFL speaking
 * surface. A recording ends only on «Готово» / release, the task cap or the
 * part budget. Scenarios keep their endpointer; TORFL never imports it.
 */
const TORFL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function files(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '__tests__') out.push(...files(full));
    } else if (/\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
}

describe('TORFL never endpoints on silence (T77)', () => {
  it('no file under features/torfl imports or calls the M17 endpointer', () => {
    const offenders: string[] = [];
    for (const f of files(TORFL)) {
      const src = fs.readFileSync(f, 'utf8');
      // strip comments so prose about the old behaviour does not trip the scan
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      if (/engine\/endpointing|endpointStep|endpointConfig|endpointManualStop|NO_SPEECH_MS/.test(code)) {
        offenders.push(path.relative(TORFL, f));
      }
    }
    expect(offenders).toEqual([]);
  });
});
