import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { mapAlignmentToStamps, TAIL_SHORTFALL_WARN_MS } from '../src/stamps.ts';
import { buildNarrationFromSentences } from '../src/narration.ts';
import {
  concatRunsToMp3,
  decodeToWav,
  encodeOpus,
  exciseWav,
  probeDurationMs,
} from '../src/opus.ts';

/**
 * T80 regression: the pipeline's own audio edits (decode → excise → level /
 * concat → MP3 → Opus) keep a sample-accurate timeline. If a click at t sits
 * at t − (cuts before it) after the whole chain, then neither a scale
 * (44.1/48 kHz, encoder delay) nor an offset can explain the published
 * drift/step — those come from the provider's character times, which is why
 * stamps are now re-derived from the audio (stamp-audit.ts).
 */

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** Onset (ms) of each 20 ms 1 kHz burst in an audio file. */
function clickOnsets(file: string): number[] {
  const raw = execFileSync(
    'ffmpeg',
    ['-v', 'error', '-i', file, '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'],
    { maxBuffer: 256 * 1024 * 1024 },
  );
  const a = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  const out: number[] = [];
  let last = -1e9;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i]!) > 0.2) {
      if (i - last > 3200) out.push(i / 16); // new burst after ≥ 200 ms of quiet
      last = i;
    }
  }
  return out;
}

describe('pipeline audio timeline is exact (T80 drift regression)', () => {
  it('click positions survive decode → excise → concat → MP3 → Opus within 6 ms', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aflulit-t80-'));
    dirs.push(dir);
    // 90 s of 20 ms bursts at every whole second (≥ 0.4 s).
    const expr = 'if(lt(mod(t,1),0.02)*gt(t,0.4),0.8*sin(2*PI*1000*t),0)';
    execFileSync('ffmpeg', [
      '-y',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      `aevalsrc='${expr}':s=44100:d=90`,
      '-c:a',
      'libmp3lame',
      '-b:a',
      '192k',
      join(dir, 'src.mp3'),
    ]);
    decodeToWav(join(dir, 'src.mp3'), join(dir, 'src.wav'));
    const cuts = [
      { startMs: 10_300, endMs: 11_250 },
      { startMs: 40_100, endMs: 41_900 },
      { startMs: 70_400, endMs: 71_000 },
    ];
    exciseWav(join(dir, 'src.wav'), join(dir, 'cut.wav'), cuts);
    concatRunsToMp3(
      [
        { file: join(dir, 'cut.wav'), gainDb: 0 },
        { file: join(dir, 'cut.wav'), gainDb: -3 },
      ],
      join(dir, 'track.mp3'),
    );
    encodeOpus(join(dir, 'track.mp3'), join(dir, 'track.opus'));

    const cutTotal = cuts.reduce((n, c) => n + c.endMs - c.startMs, 0);
    expect(
      Math.abs(probeDurationMs(join(dir, 'track.opus')) - 2 * (90_000 - cutTotal)),
    ).toBeLessThan(60);

    const got = clickOnsets(join(dir, 'track.opus'));
    const expectedOne: number[] = [];
    for (let k = 1; k < 90; k++) {
      const t = k * 1000;
      if (cuts.some((c) => t + 20 > c.startMs && t < c.endMs)) continue;
      expectedOne.push(
        t - cuts.filter((c) => c.endMs <= t).reduce((n, c) => n + c.endMs - c.startMs, 0),
      );
    }
    const runLen = 90_000 - cutTotal;
    const expected = [...expectedOne, ...expectedOne.map((t) => t + runLen)];
    // Bursts closer than 200 ms (after a cut) merge in the detector — compare
    // each detected onset with its nearest expected one.
    for (const g of got) {
      const nearest = Math.min(...expected.map((e) => Math.abs(e - g)));
      expect(nearest).toBeLessThan(6);
    }
    expect(got.length).toBeGreaterThan(expected.length - 12);
    // Late in the second run the offset is still ~0 (no scale): the last burst.
    const lastGot = got[got.length - 1]!;
    const lastExp = expected[expected.length - 1]!;
    expect(Math.abs(lastGot - lastExp)).toBeLessThan(6);
  });
});

describe('mapAlignmentToStamps tail guard (T80 step regression)', () => {
  const sentences = [
    {
      id: 's1',
      ru: 'Ночь.',
      en: 'Night.',
      tokens: [{ text: 'Ночь' }, { text: '.', isPunct: true as const }],
    },
    {
      id: 's2',
      ru: 'Тишина.',
      en: 'Silence.',
      tokens: [{ text: 'Тишина' }, { text: '.', isPunct: true as const }],
    },
  ];
  const narration = buildNarrationFromSentences(sentences);
  const chars = Array.from(narration.text);
  const at = (i: number) => (i * 60) / 1000;
  const alignment = {
    characters: chars,
    startSeconds: chars.map((_, i) => at(i)),
    endSeconds: chars.map((_, i) => at(i + 1)),
  };

  it('is silent when the stamped tail matches the audio', () => {
    const dur = chars.length * 60 + 200;
    const r = mapAlignmentToStamps(narration, alignment, dur);
    expect(r.issues.join(' ')).not.toMatch(/before the audio does/);
  });

  it('warns when the provider collapsed pauses (audio ≫ stamped text)', () => {
    const dur = chars.length * 60 + TAIL_SHORTFALL_WARN_MS + 1500; // rw5: +2.6 s of unstamped sound
    const r = mapAlignmentToStamps(narration, alignment, dur);
    expect(r.trusted).toBe(true);
    expect(r.issues.join(' ')).toMatch(/stamps end \d+ ms before the audio does/);
    // …and never alters the stamps themselves (byte-identical on good tracks).
    expect(r.stamps).toEqual(
      mapAlignmentToStamps(narration, alignment, chars.length * 60 + 200).stamps,
    );
  });
});

void readFileSync;
