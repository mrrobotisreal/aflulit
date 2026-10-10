import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { Pack, Sentence } from '@sumrak/schema';
import {
  assertOnlyTimestampsChanged,
  auditPack,
  lemmaLint,
  loadFrameDb,
  refineWords,
  restampPack,
  structuralChecks,
  type AlignedWord,
  type Aligner,
} from '../src/stamp-audit.ts';
import { runPublish } from '../src/publish.ts';

/**
 * T80: stamp-audit / restamp on a synthetic track. Every "word" is a 250 ms
 * 300 Hz burst, 400 ms apart, so the true word times are known exactly; the
 * fake aligner returns them with a chosen error (step / drift / constant) and
 * the audit must flag exactly the bad ones.
 */

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const N = 120;
const PERIOD = 400;
const BURST = 250;
const trueStart = (i: number) => 500 + i * PERIOD;

const sentences: Sentence[] = Array.from({ length: N / 6 }, (_, s) => ({
  id: `t-s${String(s + 1).padStart(2, '0')}`,
  ru: Array.from({ length: 6 }, (_, k) => `слово${s * 6 + k}`).join(' ') + '.',
  en: 'x',
  tokens: [
    ...Array.from({ length: 6 }, (_, k) => ({
      text: `слово${s * 6 + k}`,
      lemma: 'слово',
      spaceBefore: k > 0,
    })),
    { text: '.', isPunct: true as const },
  ],
}));

function makeAudio(): { dir: string; file: string; durationMs: number } {
  const dir = mkdtempSync(join(tmpdir(), 'sumrak-t80sa-'));
  dirs.push(dir);
  const durationMs = trueStart(N) + 500;
  // sum of gated sines, one per word
  const gate = Array.from({ length: N }, (_, i) => {
    const t0 = trueStart(i) / 1000;
    return `between(t,${t0},${t0 + BURST / 1000})`;
  }).join('+');
  execFileSync('ffmpeg', [
    '-y',
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    `aevalsrc='0.5*sin(2*PI*300*t)*(${gate})':s=16000:d=${durationMs / 1000}`,
    '-c:a',
    'libopus',
    '-b:a',
    '32k',
    join(dir, 'a.opus'),
  ]);
  return { dir, file: 'a.opus', durationMs };
}

function packWith(
  durationMs: number,
  stamps: { startMs: number; endMs: number }[],
  extra: Partial<Sentence>[] = [],
): Pack {
  const words = sentences.flatMap((s) =>
    s.tokens.flatMap((t, i) => (t.isPunct ? [] : [{ sentenceId: s.id, tokenIndex: i }])),
  );
  return {
    id: 'test-stamps',
    version: 1,
    type: 'stories',
    title: { ru: 'Т', en: 'T' },
    level: 'A1',
    tags: [],
    stories: [
      {
        id: 'story',
        title: { ru: 'Т', en: 'T' },
        level: 'A1',
        sentences: sentences.map((s, i) => ({ ...s, ...(extra[i] ?? {}) })),
        audio: [
          {
            id: 'trk',
            voice: 'elevenlabs:Test',
            style: 'plain',
            file: 'a.opus',
            durationMs,
            timestamps: words.map((w, i) => ({ ...w, ...stamps[i]! })),
          },
        ],
      },
    ],
  } as unknown as Pack;
}

/** Fake aligner = the true word times, then `skew(i, t)` applied (alignment error). */
const alignerWith =
  (skew: (i: number, t: number) => number): Aligner =>
  (_f, words) =>
    words.map((w, i) => {
      const s = trueStart(i);
      return {
        id: w.id,
        startMs: Math.round(skew(i, s)),
        endMs: Math.round(skew(i, s) + BURST - 40), // peaky/early end like CTC
        aligned: true,
      };
    });

const published = (f: (i: number) => number) =>
  Array.from({ length: N }, (_, i) => ({
    startMs: Math.round(f(i)),
    endMs: Math.round(f(i) + BURST - 20),
  }));

describe('stamp-audit on a synthetic track', () => {
  const { dir, durationMs } = makeAudio();

  it('passes stamps that match the audio', () => {
    const pack = packWith(durationMs, published(trueStart));
    const audit = auditPack(
      pack,
      dir,
      alignerWith((_, t) => t),
    );
    const t = audit.tracks[0]!;
    expect(t.failures).toEqual([]);
    expect(Math.abs(t.medianMs)).toBeLessThanOrEqual(10);
    expect(audit.ok).toBe(true);
  });

  it('flags a +1.8 s STEP after word 40 (the sr1/rw5 shape)', () => {
    const pack = packWith(
      durationMs,
      published((i) => trueStart(i) - (i >= 40 ? 1800 : 0)),
    );
    const t = auditPack(
      pack,
      dir,
      alignerWith((_, t) => t),
    ).tracks[0]!;
    expect(t.ok).toBe(false);
    expect(t.maxStepMs).toBeGreaterThan(1500);
    expect(t.failures.join(' ')).toMatch(/step/);
  });

  it('flags linear DRIFT (stamps −60 ms/min late) even when the median is small', () => {
    const pack = packWith(
      durationMs,
      published((i) => trueStart(i) + (i * PERIOD * 0.06) / 60),
    );
    const t = auditPack(
      pack,
      dir,
      alignerWith((_, t) => t),
    ).tracks[0]!;
    expect(t.driftMsPerMin).toBeLessThan(-20);
    expect(t.failures.join(' ')).toMatch(/drift/);
  });

  it('flags a constant 120 ms offset by the median threshold', () => {
    const pack = packWith(
      durationMs,
      published((i) => trueStart(i) + 120),
    );
    const t = auditPack(
      pack,
      dir,
      alignerWith((_, t) => t),
    ).tracks[0]!;
    expect(t.failures.join(' ')).toMatch(/median offset/);
  });

  it('flags end-clipped stamps (end before the voiced tail)', () => {
    const clipped = Array.from({ length: N }, (_, i) => ({
      startMs: trueStart(i),
      endMs: trueStart(i) + 90, // word is voiced until +250
    }));
    const t = auditPack(
      packWith(durationMs, clipped),
      dir,
      alignerWith((_, t) => t),
    ).tracks[0]!;
    expect(t.endClipRate).toBeGreaterThan(0.5);
  });

  it('refineWords extends a peaky end to the true release and keeps monotonic order', () => {
    const db = loadFrameDb(join(dir, 'a.opus'));
    const aligned: AlignedWord[] = Array.from({ length: N }, (_, i) => ({
      id: `x:${i}`,
      startMs: trueStart(i) + 30, // late start, like CTC
      endMs: trueStart(i) + 120, // early end
      aligned: true,
    }));
    const r = refineWords(aligned, db, durationMs);
    let medStartErr = 0;
    let medEndErr = 0;
    r.forEach((w, i) => {
      medStartErr += Math.abs(w.startMs - trueStart(i));
      medEndErr += Math.abs(w.endMs - (trueStart(i) + BURST));
      if (i > 0) expect(w.startMs).toBeGreaterThanOrEqual(r[i - 1]!.endMs);
    });
    expect(medStartErr / N).toBeLessThan(25);
    expect(medEndErr / N).toBeLessThan(40);
  });

  it('restamp: after-audit passes and ONLY timestamps change (identity asserted)', () => {
    const pack = packWith(
      durationMs,
      published((i) => trueStart(i) - (i >= 40 ? 1800 : 0)),
    );
    const aligner = alignerWith((_, t) => t);
    const { pack: next, tracks } = restampPack(pack, dir, aligner);
    expect(tracks).toEqual(['trk']);
    expect(next.stories[0]!.sentences).toEqual(pack.stories[0]!.sentences);
    expect(auditPack(next, dir, aligner).ok).toBe(true);
    assertOnlyTimestampsChanged(pack, next);
    const tampered = structuredClone(next);
    tampered.title = { ru: 'другое', en: 'other' };
    expect(() => assertOnlyTimestampsChanged(pack, tampered)).toThrow(/more than/);
  });

  it('restamp is idempotent on correct stamps', () => {
    const pack = packWith(durationMs, published(trueStart));
    const aligner = alignerWith((_, t) => t);
    const once = restampPack(pack, dir, aligner).pack;
    const twice = restampPack(once, dir, aligner).pack;
    expect(twice).toEqual(once);
  });
});

describe('structural + lemma lint', () => {
  it('structuralChecks reports a sentence whose stamped indices skip a word token', () => {
    const s = sentences[0]!;
    const all = s.tokens.flatMap((t, i) => (t.isPunct ? [] : [i]));
    const stamps = all.slice(0, -1).map((tokenIndex, k) => ({
      sentenceId: s.id,
      tokenIndex,
      startMs: k * 100,
      endMs: k * 100 + 50,
    }));
    expect(structuralChecks([s], stamps)).toHaveLength(1);
    expect(
      structuralChecks(
        [s],
        all.map((tokenIndex, k) => ({
          sentenceId: s.id,
          tokenIndex,
          startMs: k * 100,
          endMs: k * 100 + 50,
        })),
      ),
    ).toEqual([]);
  });

  it('lemmaLint flags an adverb with an adjective lemma («ужасно» → «ужасный») and nothing else', () => {
    const mk = (text: string, lemma: string): Sentence =>
      ({ id: 'l-s01', ru: text, en: 'x', tokens: [{ text, lemma }] }) as unknown as Sentence;
    expect(lemmaLint([mk('ужасно', 'ужасный')])).toHaveLength(1);
    expect(lemmaLint([mk('ужасно', 'ужасно')])).toEqual([]);
    expect(lemmaLint([mk('ужасное', 'ужасный')])).toEqual([]);
    expect(lemmaLint([mk('хорошо', 'хороший')])).toHaveLength(1);
    expect(lemmaLint([mk('окно', 'окно')])).toEqual([]);
  });
});

describe('publish gate', () => {
  const { dir, durationMs } = makeAudio();
  const content = () => {
    const c = mkdtempSync(join(tmpdir(), 'sumrak-t80pub-'));
    dirs.push(c);
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: c });
    execFileSync('git', ['config', 'user.email', 't@t'], { cwd: c });
    execFileSync('git', ['config', 'user.name', 't'], { cwd: c });
    writeFileSync(join(c, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, packs: [] })}\n`);
    execFileSync('git', ['add', '.'], { cwd: c });
    execFileSync('git', ['commit', '-q', '-m', 'i'], { cwd: c });
    return c;
  };

  it('refuses a failing pack, logs --allow-stamp-risk, passes a restamped one', () => {
    const bad = packWith(
      durationMs,
      published((i) => trueStart(i) - (i >= 40 ? 1800 : 0)),
    );
    writeFileSync(join(dir, 'pack.json'), JSON.stringify(bad));
    const aligner = alignerWith((_, t) => t);
    expect(() => runPublish(dir, content(), { stampAudit: aligner })).toThrow(/stamp audit FAILED/);
    expect(existsSync(join(dir, 'BUILD_NOTES.md'))).toBe(false);

    const forced = runPublish(dir, content(), { stampAudit: aligner, allowStampRisk: true });
    expect(forced.outcome).toBe('published');
    expect(readFileSync(join(dir, 'BUILD_NOTES.md'), 'utf8')).toMatch(/--allow-stamp-risk/);

    const fixed = restampPack(bad, dir, aligner).pack;
    writeFileSync(join(dir, 'pack.json'), JSON.stringify(fixed));
    const ok = runPublish(dir, content(), { stampAudit: aligner });
    expect(ok.outcome).toBe('published');
  });
});
