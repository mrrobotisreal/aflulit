import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { AudioTrack, Pack, Sentence, WordStamp } from '@aflulit/schema';

/**
 * Word-stamp accuracy audit + forced-alignment restamp (T80).
 *
 * Why: ElevenLabs character times describe the *text*, not the *audio* — a
 * breath/sigh/laugh/long paragraph pause the model inserts (or a v4 take that
 * drifts) carries no character time, so every stamp after it is early (a
 * "step", +1.2–2.6 s on rw5/sr1/sh2) or slowly late (v4 "drift", −27 ms/min).
 * Nothing in the render path ever looked at the audio again. This module does:
 *
 *   1. `alignWords` — a CTC forced aligner (tools/forced_align.py, Russian
 *      wav2vec2) places each KNOWN word in the published audio;
 *   2. `refineWords` — boundary refinement on 5 ms RMS frames (the aligner's
 *      token spans are peaky: starts ≈ +40 ms late, ends early);
 *   3. `auditTrack` — compares the published stamps with the refined truth
 *      (median / p95 |offset|, step, drift, end-clip, structure, lemma lint);
 *   4. `restampTrack` — a new `timestamps` array, one stamp per word token.
 */

// ───────────────────────────── types ─────────────────────────────

/** One word the aligner must place: `<sentenceId>:<tokenIndex>`. */
export interface AlignWord {
  id: string;
  text: string;
}
export interface AlignedWord {
  id: string;
  startMs: number;
  endMs: number;
  /** False when the word had no alignable letters and was interpolated. */
  aligned: boolean;
}
/** Pluggable aligner: the real one shells out to Python; tests inject a fake. */
export type Aligner = (audioFile: string, words: readonly AlignWord[]) => AlignedWord[];

export const THRESHOLDS = {
  medianMs: 40,
  p95Ms: 120,
  /**
   * T80b truth-calibrated pause-edge gate (frozen truth set, Whisper large-v3 + energy edges): a published track is
   * healthy when, at its audio pauses, the word-START stamps sit within ±60 ms median / 150 ms p90 of the true energy
   * onset and the word-END stamps within ±150 / 250 ms of the offset (published ElevenLabs ends sit ~80 ms early by
   * convention). Tracks with fewer than `edgeMinPauses` usable pauses fall back to the CTC-refined median/p95 gate.
   */
  edgeStartMedianMs: 60,
  edgeStartP90Ms: 150,
  edgeEndMedianMs: 150,
  edgeEndP90Ms: 250,
  edgeMinPauses: 6,
  stepMs: 250,
  driftMsPerMin: 20,
  /** A stamp end this close to still-voiced audio counts as end-clipped. */
  endClipDropDb: 12,
} as const;

export interface TrackAudit {
  trackId: string;
  /** T80b pause-edge statistics (published stamp − audio energy edge, ms); null when too few pauses. */
  edge: {
    pauses: number;
    startMedianMs: number;
    startP90Ms: number;
    endMedianMs: number;
    endP90Ms: number;
  } | null;
  durationMs: number;
  words: number;
  stamped: number;
  medianMs: number;
  p95Ms: number;
  maxStepMs: number;
  stepAtMs: number | null;
  driftMsPerMin: number;
  endClipRisk: number;
  endClipRate: number;
  structural: string[];
  lemmaLint: string[];
  /** Reported but not gating (lemma lint: legitimate predicatives share the pattern). */
  warnings: string[];
  failures: string[];
  ok: boolean;
}

// ───────────────────────────── audio ─────────────────────────────

const SR = 16000;
const FRAME = 80; // samples = 5 ms
export const FRAME_MS = 5;

/** RMS level in dB per 5 ms frame of the audio file (mono 16 kHz via ffmpeg). */
export function loadFrameDb(audioFile: string): Float64Array {
  const res = spawnSync(
    'ffmpeg',
    ['-v', 'error', '-i', audioFile, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'],
    { maxBuffer: 1024 * 1024 * 1024 },
  );
  if (res.error || res.status !== 0) {
    throw new Error(`ffmpeg could not decode ${audioFile}: ${res.stderr?.toString().slice(-300)}`);
  }
  const buf = res.stdout;
  const samples = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
  const n = Math.floor(samples.length / FRAME);
  const db = new Float64Array(n);
  for (let f = 0; f < n; f++) {
    let sum = 0;
    for (let i = f * FRAME; i < (f + 1) * FRAME; i++) sum += samples[i]! * samples[i]!;
    db[f] = 20 * Math.log10(Math.sqrt(sum / FRAME) + 1e-9);
  }
  return db;
}

// ──────────────────────────── aligner ────────────────────────────

export interface PythonAlignerOptions {
  /** Python with torch + torchaudio + transformers (default $AFLULIT_ALIGN_PYTHON or python3). */
  python?: string;
  /** Result cache dir (default $AFLULIT_ALIGN_CACHE or ~/.cache/aflulit-align). */
  cacheDir?: string;
  device?: string;
  engine?: 'ctc-ru' | 'whisper';
}

const TOOL = resolve(dirname(new URL(import.meta.url).pathname), '..', 'tools', 'forced_align.py');

/** The shipped aligner: tools/forced_align.py, cached by sha256(audio + words). */
export function pythonAligner(opts: PythonAlignerOptions = {}): Aligner {
  const python = opts.python ?? process.env.AFLULIT_ALIGN_PYTHON ?? 'python3';
  const cacheDir =
    opts.cacheDir ?? process.env.AFLULIT_ALIGN_CACHE ?? join(homedir(), '.cache', 'aflulit-align');
  const engine = opts.engine ?? 'ctc-ru';
  return (audioFile, words) => {
    const key = createHash('sha256')
      .update(readFileSync(audioFile))
      .update(JSON.stringify(words))
      .update(engine)
      .digest('hex');
    const cached = join(cacheDir, `${key}.json`);
    if (existsSync(cached)) return (JSON.parse(readFileSync(cached, 'utf8')) as AlignOut).words;
    const work = mkdtempSync(join(tmpdir(), 'aflulit-align-'));
    try {
      const wordsFile = join(work, 'words.json');
      const outFile = join(work, 'out.json');
      writeFileSync(wordsFile, JSON.stringify(words));
      const res = spawnSync(
        python,
        [
          TOOL,
          '--audio',
          audioFile,
          '--words',
          wordsFile,
          '--out',
          outFile,
          '--engine',
          engine,
          '--device',
          opts.device ?? process.env.AFLULIT_ALIGN_DEVICE ?? 'cpu',
        ],
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
      );
      if (res.status !== 0) {
        throw new Error(
          `forced aligner failed (${python} ${TOOL}): ${(res.stderr || res.stdout || String(res.error)).slice(-600)}\n` +
            'See packages/pipeline/docs/AUTHORING.md «Timestamps» for the aligner venv.',
        );
      }
      const out = JSON.parse(readFileSync(outFile, 'utf8')) as AlignOut;
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(cached, JSON.stringify(out));
      return out.words;
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  };
}
/** Fail fast (before any paid render) when the aligner venv is missing. */
export function alignerPreflight(opts: PythonAlignerOptions = {}): void {
  const python = opts.python ?? process.env.AFLULIT_ALIGN_PYTHON ?? 'python3';
  const res = spawnSync(python, ['-c', 'import torch, torchaudio, transformers, numpy'], {
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    throw new Error(
      `forced-alignment venv not usable (${python}): ${(res.stderr || String(res.error)).trim().split('\n').pop()}\n` +
        'Set AFLULIT_ALIGN_PYTHON to a python3.12 venv with torch torchaudio transformers numpy ' +
        '(AUTHORING «Timestamps»), or pass --no-restamp to keep the provider stamps (they will fail stamp-audit).',
    );
  }
}

interface AlignOut {
  engine: string;
  words: AlignedWord[];
}

/** Every non-punctuation token of a story, in reading order. */
export function wordsOfStory(sentences: readonly Sentence[]): AlignWord[] {
  const out: AlignWord[] = [];
  for (const s of sentences) {
    s.tokens.forEach((t, i) => {
      if (!t.isPunct) out.push({ id: `${s.id}:${i}`, text: t.text });
    });
  }
  return out;
}

// ─────────────────────────── refinement ──────────────────────────

const START_SEARCH_MS = 80;
/** T80b start-extension tuning (chosen against the frozen truth set, see Stories/_build/stamp-audit-2026-10-10/after-T80b). */
export const START_EXTEND = {
  /** Walk back while frames are within this many dB of the word's own CTC-span peak… */
  relDb: 40,
  /** …and at least this far above the track's 5th-percentile (noise floor) level. */
  aboveFloorDb: 12,
  /** Bridge dips up to this many 5 ms frames (stop consonants / closures). */
  dipFrames: 6,
  /** The previous word may not be eaten into: lower bound = prev start + this many ms per prev letter. */
  prevMsPerLetter: 45,
  maxExtendMs: 1500,
} as const;
/** T80b: extend a word's end over its contiguous voiced run (bridging closures) — the first-drop rule clips tails. */
export const END_EXTEND = { relDb: 40, aboveFloorDb: 20, dipFrames: 6, maxMs: 250 } as const;
const END_SEARCH_MS = 450;
const END_DROP_DB = 14;
const MIN_WORD_MS = 20;

/**
 * Snap aligner spans to the audio: each start to the quiet point just before
 * the word's energy rise (within ±80 ms, never past the midpoint to a
 * neighbour), each end to the first real energy drop after the final phoneme
 * (the CTC end is peaky/early — «ужасная» must keep its «-ая»). Monotonic,
 * non-overlapping, inside [0, durationMs], integer ms.
 */
export function refineWords(
  aligned: readonly AlignedWord[],
  db: Float64Array,
  durationMs: number,
  letters?: readonly number[],
): AlignedWord[] {
  const n = aligned.length;
  const fr = (ms: number) => Math.max(0, Math.min(db.length - 1, Math.round(ms / FRAME_MS)));
  const floorDb = noiseFloorDb(db);
  const starts = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const w = aligned[i]!;
    if (!w.aligned) {
      starts[i] = w.startMs;
      continue;
    }
    const prevEnd = i > 0 ? aligned[i - 1]!.endMs : 0;
    const lo = Math.max(w.startMs - START_SEARCH_MS, i > 0 ? (prevEnd + w.startMs) / 2 : 0);
    const hi = Math.min(w.startMs + START_SEARCH_MS, (w.startMs + w.endMs) / 2);
    if (hi <= lo) {
      starts[i] = w.startMs;
      continue;
    }
    let min = Infinity;
    for (let f = fr(lo); f <= fr(hi); f++) min = Math.min(min, db[f]!);
    let pick = fr(lo);
    for (let f = fr(lo); f <= fr(hi); f++) if (db[f]! <= min + 2) pick = f; // latest near-min
    starts[i] = pick * FRAME_MS;
  }
  // T80b: the CTC token span of a sentence-initial / post-pause word is "peaky" (one or two frames at the END of the
  // word's energy; td1 «Ты» 22640–22700 vs a true 21.5–22.6 s), so the snap above cannot find the onset. Walk each
  // start back over the contiguous voiced run, bounded by the previous word.
  for (let i = 0; i < n; i++) {
    const w = aligned[i]!;
    if (!w.aligned) continue;
    starts[i] = extendStart(i, aligned, db, starts[i]!, floorDb, letters);
  }
  // Starts must be strictly increasing.
  for (let i = 1; i < n; i++) if (starts[i]! <= starts[i - 1]!) starts[i] = starts[i - 1]! + 1;

  const out: AlignedWord[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const w = aligned[i]!;
    const start = Math.min(starts[i]!, durationMs - 1);
    const upper = i + 1 < n ? starts[i + 1]! : durationMs;
    let end = Math.max(w.endMs, start + MIN_WORD_MS);
    if (w.aligned) {
      let peak = -Infinity;
      for (let f = fr(start); f <= fr(Math.max(start, w.endMs)); f++) peak = Math.max(peak, db[f]!);
      const limit = Math.min(upper, w.endMs + END_SEARCH_MS);
      let found = -1;
      for (let f = fr(w.endMs); f * FRAME_MS <= limit && f < db.length; f++) {
        if (db[f]! < peak - END_DROP_DB) {
          found = f * FRAME_MS;
          break;
        }
      }
      if (found < 0) {
        // Continuous speech into the next word: end at the valley before it.
        const winEnd = Math.min(upper, w.endMs + 250);
        let min = Infinity;
        let at = w.endMs;
        for (let f = fr(w.endMs); f * FRAME_MS <= winEnd && f < db.length; f++) {
          if (db[f]! <= min) {
            min = db[f]!;
            at = f * FRAME_MS;
          }
        }
        found = at;
      }
      end = Math.max(found, start + MIN_WORD_MS);
      // T80b: the first-drop rule can stop inside a word's own dip; extend over the contiguous voiced run (bridging
      // short closures) up to END_EXTEND_MS so a word's tail is never clipped.
      const thr = Math.max(peak - END_EXTEND.relDb, floorDb + END_EXTEND.aboveFloorDb);
      let q = fr(end);
      let bestQ = q;
      let dips = 0;
      while (q + 1 < db.length && (q + 1) * FRAME_MS <= Math.min(upper, end + END_EXTEND.maxMs)) {
        if (db[q + 1]! >= thr) {
          bestQ = q + 1;
          dips = 0;
        } else if (++dips > END_EXTEND.dipFrames) break;
        q++;
      }
      end = Math.max(end, bestQ * FRAME_MS);
    }
    end = Math.min(end, upper, durationMs);
    if (end <= start) end = Math.min(durationMs, start + 1);
    out[i] = { id: w.id, startMs: Math.round(start), endMs: Math.round(end), aligned: w.aligned };
  }
  return out;
}

/** 5th-percentile frame level (the track's noise floor). */
export function noiseFloorDb(db: Float64Array): number {
  const sorted = [...db].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.05)] ?? -90;
}

/** Walk a start back to the onset of the voiced run that contains it (T80b). */
function extendStart(
  i: number,
  aligned: readonly AlignedWord[],
  db: Float64Array,
  start: number,
  floorDb: number,
  letters?: readonly number[],
): number {
  const w = aligned[i]!;
  const fr = (ms: number) => Math.max(0, Math.min(db.length - 1, Math.round(ms / FRAME_MS)));
  let peak = -Infinity;
  for (let f = fr(w.startMs); f <= fr(w.endMs); f++) peak = Math.max(peak, db[f]!);
  const thr = Math.max(peak - START_EXTEND.relDb, floorDb + START_EXTEND.aboveFloorDb);
  let lower = 0;
  if (i > 0) {
    const p = aligned[i - 1]!;
    const prevBody = p.aligned
      ? p.startMs + START_EXTEND.prevMsPerLetter * (letters?.[i - 1] ?? 4)
      : p.endMs;
    lower = Math.min(prevBody, start - 20);
  }
  lower = Math.max(lower, start - START_EXTEND.maxExtendMs, 0);
  const lo = fr(lower);
  let f = fr(start);
  let best = f;
  let dips = 0;
  while (f - 1 >= lo) {
    if (db[f - 1]! >= thr) {
      best = f - 1;
      dips = 0;
    } else if (++dips > START_EXTEND.dipFrames) break;
    f--;
  }
  return best * FRAME_MS < start ? best * FRAME_MS : start;
}

// ───────────────────────────── audit ─────────────────────────────

function median(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
function percentile(xs: readonly number[], p: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
}
function slopePerMin(xs: readonly number[], ys: readonly number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - mx) * (ys[i]! - my);
    den += (xs[i]! - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

/** Index-set + lemma lint of one story's sentences against one track's stamps. */
export function structuralChecks(
  sentences: readonly Sentence[],
  stamps: readonly WordStamp[],
): string[] {
  const bySentence = new Map<string, number[]>();
  for (const st of stamps) {
    const list = bySentence.get(st.sentenceId) ?? [];
    list.push(st.tokenIndex);
    bySentence.set(st.sentenceId, list);
  }
  const issues: string[] = [];
  for (const s of sentences) {
    const have = bySentence.get(s.id);
    if (!have) continue;
    const want = s.tokens.flatMap((t, i) => (t.isPunct ? [] : [i]));
    if (have.length !== want.length || have.some((v, i) => v !== want[i])) {
      const missing = want.filter((i) => !have.includes(i));
      issues.push(
        `${s.id}: stamped token indices ≠ non-punct tokens (missing ${missing.join(',')})`,
      );
    }
  }
  return issues;
}

/** Adverb surface (-о) carrying its adjective's lemma («ужасно» → «ужасный»). */
export function lemmaLint(sentences: readonly Sentence[]): string[] {
  const issues: string[] = [];
  for (const s of sentences) {
    s.tokens.forEach((t, i) => {
      if (t.isPunct || !t.lemma) return;
      const surface = t.text.toLowerCase().replace(/ё/g, 'е');
      const lemma = t.lemma.toLowerCase().replace(/ё/g, 'е');
      if (!surface.endsWith('о') || surface.length < 4) return;
      const stem = surface.slice(0, -1);
      if (lemma !== surface && /(ый|ий|ой)$/.test(lemma) && lemma.slice(0, -2) === stem) {
        issues.push(
          `${s.id} t${i}: «${t.text}» has lemma «${t.lemma}» (adverb lemmatized as its adjective)`,
        );
      }
    });
  }
  return issues;
}

/**
 * Pauses (>= 120 ms below floor+14 dB) with the energy offset of the speech before and the onset of the speech after
 * (edge = where the level crosses peak−34 dB, never below floor+20). Pure audio; no aligner involved.
 */
export function pauseEdges(db: Float64Array): { offMs: number; onMs: number }[] {
  const floor = noiseFloorDb(db);
  const sil = floor + 14;
  const out: { offMs: number; onMs: number }[] = [];
  const n = db.length;
  let f = 0;
  while (f < n) {
    if (db[f]! >= sil) {
      f++;
      continue;
    }
    let g = f;
    while (g < n && db[g]! < sil) g++;
    if (g - f >= 24 && f > 0 && g < n) {
      let pk = -Infinity;
      for (let k = Math.max(0, f - 20); k < f; k++) pk = Math.max(pk, db[k]!);
      let thr = Math.max(pk - 34, floor + 20);
      let h = f;
      while (h > Math.max(0, f - 120) && db[h - 1]! < thr) h--;
      pk = -Infinity;
      for (let k = g; k < Math.min(n, g + 20); k++) pk = Math.max(pk, db[k]!);
      thr = Math.max(pk - 34, floor + 20);
      let k2 = g;
      while (k2 < Math.min(n - 1, g + 120) && db[k2]! < thr) k2++;
      out.push({ offMs: h * FRAME_MS, onMs: k2 * FRAME_MS });
    }
    f = g;
  }
  return out;
}

function edgeStats(
  stamps: readonly WordStamp[],
  truth: ReadonlyMap<string, AlignedWord>,
  db: Float64Array,
): TrackAudit['edge'] {
  const floor = noiseFloorDb(db);
  const words = [...truth.values()].sort((a, b) => a.startMs - b.startMs);
  const stamp = new Map(stamps.map((s) => [`${s.sentenceId}:${s.tokenIndex}`, s]));
  const ds: number[] = [];
  const de: number[] = [];
  const pauses = pauseEdges(db);
  for (const p of pauses) {
    const nxt = words.find((w) => w.startMs >= p.onMs - 150);
    if (
      nxt &&
      nxt.startMs - p.onMs <= 700 &&
      (db[Math.round(p.onMs / FRAME_MS) + 2] ?? -90) > floor + 25
    ) {
      const s = stamp.get(nxt.id);
      if (s) ds.push(s.startMs - p.onMs);
    }
    let prv: AlignedWord | undefined;
    for (const w of words) if (w.endMs <= p.offMs + 150) prv = w;
    if (prv && p.offMs - prv.endMs <= 700) {
      const s = stamp.get(prv.id);
      if (s) de.push(s.endMs - p.offMs);
    }
  }
  if (ds.length < THRESHOLDS.edgeMinPauses || de.length < THRESHOLDS.edgeMinPauses) return null;
  return {
    pauses: pauses.length,
    startMedianMs: Math.round(median(ds)),
    startP90Ms: Math.round(percentile(ds.map(Math.abs), 0.9)),
    endMedianMs: Math.round(median(de)),
    endP90Ms: Math.round(percentile(de.map(Math.abs), 0.9)),
  };
}

/**
 * Compare a track's published stamps with the refined audio truth. `refined`
 * is the output of {@link refineWords} for the SAME word list.
 */
export function auditTrack(
  track: Pick<AudioTrack, 'id' | 'durationMs' | 'timestamps'>,
  sentences: readonly Sentence[],
  refined: readonly AlignedWord[],
  db: Float64Array,
): TrackAudit {
  const truth = new Map(refined.filter((r) => r.aligned).map((r) => [r.id, r]));
  const offs: number[] = [];
  const xs: number[] = [];
  let clip = 0;
  let clipChecked = 0;
  for (const st of track.timestamps) {
    const t = truth.get(`${st.sentenceId}:${st.tokenIndex}`);
    if (!t) continue;
    offs.push(t.startMs - st.startMs);
    xs.push(st.startMs / 60000);
    // End clip: still-voiced audio right after the stamp end while the
    // refined end lies later than the stamp end.
    const f = Math.min(db.length - 1, Math.round(st.endMs / FRAME_MS));
    let peak = -Infinity;
    for (let k = Math.round(st.startMs / FRAME_MS); k <= f; k++)
      peak = Math.max(peak, db[k] ?? -90);
    const after = Math.max(db[f] ?? -90, db[Math.min(db.length - 1, f + 3)] ?? -90);
    clipChecked++;
    if (t.endMs - st.endMs > 30 && after > peak - THRESHOLDS.endClipDropDb) clip++;
  }
  const absOff = offs.map(Math.abs);
  const med = median(offs);
  // Step: jump of the rolling median (window 15, hop 5) between neighbours.
  let maxStep = 0;
  let stepAt: number | null = null;
  const K = 15;
  let prev: number | null = null;
  for (let i = 0; i + K <= offs.length; i += 5) {
    const m = median(offs.slice(i, i + K));
    if (prev !== null && Math.abs(m - prev) > maxStep) {
      maxStep = Math.abs(m - prev);
      stepAt = Math.round(xs[i]! * 60000);
    }
    prev = m;
  }
  const drift = slopePerMin(xs, offs);
  const structural = structuralChecks(sentences, track.timestamps);
  const lemma = lemmaLint(sentences);
  const failures: string[] = [];
  const p95 = percentile(absOff, 0.95);
  const edge = edgeStats(track.timestamps, truth, db);
  if (edge) {
    // T80b: judged on pause edges (truth-calibrated), not on the CTC-refined start of every word.
    if (Math.abs(edge.startMedianMs) > THRESHOLDS.edgeStartMedianMs)
      failures.push(`word starts ${edge.startMedianMs} ms from the audio onsets`);
    else if (edge.startP90Ms > THRESHOLDS.edgeStartP90Ms)
      failures.push(`word-start p90 ${edge.startP90Ms} ms at pauses`);
    if (Math.abs(edge.endMedianMs) > THRESHOLDS.edgeEndMedianMs)
      failures.push(`word ends ${edge.endMedianMs} ms from the audio offsets`);
    else if (edge.endP90Ms > THRESHOLDS.edgeEndP90Ms)
      failures.push(`word-end p90 ${edge.endP90Ms} ms at pauses`);
  } else {
    if (Math.abs(med) > THRESHOLDS.medianMs) failures.push(`median offset ${Math.round(med)} ms`);
    if (p95 > THRESHOLDS.p95Ms) failures.push(`p95 |offset| ${Math.round(p95)} ms`);
  }
  if (maxStep > THRESHOLDS.stepMs)
    failures.push(`step ${Math.round(maxStep)} ms near ${stepAt} ms`);
  if (Math.abs(drift) > THRESHOLDS.driftMsPerMin) failures.push(`drift ${drift.toFixed(1)} ms/min`);
  if (structural.length > 0) failures.push(`${structural.length} structural issue(s)`);
  const warnings = lemma.length > 0 ? [`${lemma.length} lemma-lint hit(s)`] : [];
  return {
    trackId: track.id,
    edge,
    durationMs: track.durationMs,
    words: truth.size,
    stamped: track.timestamps.length,
    medianMs: Math.round(med),
    p95Ms: Math.round(p95),
    maxStepMs: Math.round(maxStep),
    stepAtMs: stepAt,
    driftMsPerMin: Math.round(drift * 10) / 10,
    endClipRisk: clip,
    endClipRate: clipChecked === 0 ? 0 : Math.round((clip / clipChecked) * 1000) / 1000,
    structural,
    lemmaLint: lemma,
    warnings,
    failures,
    ok: failures.length === 0,
  };
}

// ───────────────────────────── restamp ───────────────────────────

/** New `timestamps` for a track: one stamp per word token, refined on the audio. */
export function restampTrack(
  sentences: readonly Sentence[],
  refined: readonly AlignedWord[],
): WordStamp[] {
  const out: WordStamp[] = [];
  let lastEnd = 0;
  for (const r of refined) {
    const [sentenceId, ti] = [
      r.id.slice(0, r.id.lastIndexOf(':')),
      Number(r.id.slice(r.id.lastIndexOf(':') + 1)),
    ];
    const startMs = Math.max(r.startMs, lastEnd);
    const endMs = Math.max(r.endMs, startMs + 1);
    out.push({ sentenceId, tokenIndex: ti, startMs, endMs });
    lastEnd = endMs;
  }
  void sentences;
  return out;
}

export interface TrackWork {
  storyId: string;
  track: AudioTrack;
  sentences: readonly Sentence[];
  refined: AlignedWord[];
  db: Float64Array;
}

/** Align + refine one track (the shared front half of audit and restamp). */
export function analyseTrack(
  packDir: string,
  storyId: string,
  track: AudioTrack,
  sentences: readonly Sentence[],
  aligner: Aligner,
): TrackWork {
  const file = join(packDir, track.file);
  const words = wordsOfStory(sentences);
  const aligned = aligner(file, words);
  if (aligned.length !== words.length) {
    throw new Error(`${track.id}: aligner returned ${aligned.length} words for ${words.length}`);
  }
  const db = loadFrameDb(file);
  const letters = words.map((x) => (x.text.toLowerCase().match(/[а-яё]/g) ?? []).length);
  const refined = refineWords(aligned, db, track.durationMs, letters);
  return { storyId, track, sentences, refined, db };
}

export interface PackAudit {
  packId: string;
  tracks: TrackAudit[];
  ok: boolean;
}

/** Audit every timestamped story track of a pack. */
export function auditPack(
  pack: Pack,
  packDir: string,
  aligner: Aligner,
  filter?: { trackId?: string },
): PackAudit {
  const tracks: TrackAudit[] = [];
  for (const story of pack.stories) {
    for (const track of story.audio) {
      if (track.timestamps.length === 0) continue;
      if (filter?.trackId && track.id !== filter.trackId) continue;
      const w = analyseTrack(packDir, story.id, track, story.sentences, aligner);
      tracks.push(auditTrack(track, story.sentences, w.refined, w.db));
    }
  }
  return { packId: pack.id, tracks, ok: tracks.every((t) => t.ok) };
}

/**
 * Restamp a pack: returns a deep copy whose ONLY difference is
 * `stories[].audio[].timestamps` — asserted before returning.
 */
export function restampPack(
  pack: Pack,
  packDir: string,
  aligner: Aligner,
  filter?: { trackId?: string; keepHealthy?: boolean },
): { pack: Pack; tracks: string[]; kept: string[] } {
  const next = structuredClone(pack);
  const done: string[] = [];
  const kept: string[] = [];
  next.stories.forEach((story, si) => {
    story.audio.forEach((track, ti) => {
      if (track.timestamps.length === 0) return;
      if (filter?.trackId && track.id !== filter.trackId) return;
      const w = analyseTrack(
        packDir,
        story.id,
        pack.stories[si]!.audio[ti]!,
        story.sentences,
        aligner,
      );
      // T80b keep-healthy-track policy: stamps that already pass the audit stay byte-identical.
      if (filter?.keepHealthy !== false) {
        const a0 = auditTrack(pack.stories[si]!.audio[ti]!, story.sentences, w.refined, w.db);
        if (a0.ok) {
          kept.push(track.id);
          return;
        }
      }
      track.timestamps = restampTrack(story.sentences, w.refined);
      done.push(track.id);
    });
  });
  assertOnlyTimestampsChanged(pack, next);
  return { pack: next, tracks: done, kept };
}

/** Throws unless `after` equals `before` everywhere except track timestamps. */
export function assertOnlyTimestampsChanged(before: Pack, after: Pack): void {
  const strip = (p: Pack): unknown => {
    const c = structuredClone(p);
    for (const s of c.stories) for (const a of s.audio) a.timestamps = [];
    return c;
  };
  if (JSON.stringify(strip(before)) !== JSON.stringify(strip(after))) {
    throw new Error('restamp changed more than audio[].timestamps — refusing');
  }
}

export function formatAuditTable(audit: PackAudit): string {
  const lines = [`${audit.packId} — ${audit.ok ? 'OK' : 'FAIL'}`];
  for (const t of audit.tracks) {
    lines.push(
      `  ${t.ok ? 'ok  ' : 'FAIL'} ${t.trackId.padEnd(26)} med ${String(t.medianMs).padStart(6)} ms  p95 ${String(t.p95Ms).padStart(5)}  step ${String(t.maxStepMs).padStart(5)}  drift ${String(t.driftMsPerMin).padStart(7)}/min  endclip ${(t.endClipRate * 100).toFixed(1)}%` +
        (t.failures.length ? `  [${t.failures.join('; ')}]` : '') +
        (t.warnings.length ? `  (warn: ${t.warnings.join('; ')})` : ''),
    );
  }
  return lines.join('\n');
}
