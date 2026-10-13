import { track } from './analytics';

/**
 * T78: every short learning clip (TTS or a word/sentence slice) takes
 * AUDIOFOCUS_GAIN_TRANSIENT before its first sample and abandons it when the
 * clip ends or stops, so other apps always PAUSE (never duck) and resume.
 *
 * The native request lives in the sherpa-speech module (its own
 * AudioFocusRequest, ref-counted — it never touches expo-audio's global
 * focus flag). Piper's `speak` brackets itself natively; everything else
 * (system TTS, expo-audio slices) goes through `holdLearningFocus` /
 * `createSliceFocus` here. Long-form narration and the ambient bed do NOT.
 */

export type FocusResult = 'granted' | 'delayed' | 'failed';
export type FocusEngine = 'piper' | 'system' | 'segment';

/** Smallest wait after `granted` that lets the other app pause before our first sample. */
export const FOCUS_SETTLE_MS = 80;

interface FocusBackend {
  requestTransientFocus(): Promise<FocusResult>;
  abandonTransientFocus(): void;
}

let backend: FocusBackend | null | undefined;

function getBackend(): FocusBackend | null {
  if (backend !== undefined) return backend;
  try {
    // Lazy: the native module throws when required off-device (vitest, web).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    backend = require('../../modules/sherpa-speech').default as FocusBackend;
  } catch {
    backend = null;
  }
  return backend;
}

/** Test seam: inject (or clear with undefined) the native backend. */
export function setFocusBackendForTests(next: FocusBackend | null | undefined): void {
  backend = next;
}

export interface FocusHandle {
  readonly result: FocusResult;
  readonly waitMs: number;
  /** Idempotent. */
  release(): void;
}

const NOOP_HANDLE: FocusHandle = { result: 'failed', waitMs: 0, release() {} };

export function reportFocus(
  surface: string,
  engine: FocusEngine,
  result: FocusResult,
  waitMs: number,
): void {
  track('learning_audio_focus', { surface, engine, result, waitMs });
}

/**
 * Take transient focus and (for non-native-bracketed engines) let the other
 * app settle. Never throws — a focus failure must not mute a lesson.
 */
export async function holdLearningFocus(
  surface: string,
  engine: Exclude<FocusEngine, 'piper'>,
): Promise<FocusHandle> {
  const b = getBackend();
  if (!b) return NOOP_HANDLE;
  const t0 = Date.now();
  let result: FocusResult = 'failed';
  try {
    result = await b.requestTransientFocus();
  } catch {
    result = 'failed';
  }
  if (result === 'failed') {
    reportFocus(surface, engine, result, Date.now() - t0);
    return { result, waitMs: 0, release() {} };
  }
  if (result === 'granted') await new Promise((r) => setTimeout(r, FOCUS_SETTLE_MS));
  const waitMs = Date.now() - t0;
  reportFocus(surface, engine, result, waitMs);
  let released = false;
  return {
    result,
    waitMs,
    release() {
      if (released) return;
      released = true;
      try {
        b.abandonTransientFocus();
      } catch {
        /* nothing to abandon */
      }
    },
  };
}

export interface SliceFocus {
  /** Take focus for the next slice (releases any previous hold first). */
  acquire(): Promise<void>;
  /** Abandon the current hold, if any. Call on slice end, stop, and unmount. */
  release(): void;
}

/**
 * One hold at a time for a hook's slice player. A release that lands while an
 * acquire is still in flight cancels it (the late handle is released at once).
 */
export function createSliceFocus(surface: string): SliceFocus {
  let current: FocusHandle | null = null;
  let epoch = 0;
  return {
    async acquire() {
      current?.release();
      current = null;
      const mine = ++epoch;
      const handle = await holdLearningFocus(surface, 'segment');
      if (mine !== epoch) {
        handle.release();
        return;
      }
      current = handle;
    },
    release() {
      epoch += 1;
      current?.release();
      current = null;
    },
  };
}
