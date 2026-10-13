import type { SliceFocus } from '@/services/learning-focus';

import type { SliceWindow } from './slice-window';

/** The slice of expo-audio's AudioPlayer the controller needs (a fake in tests). */
export interface SlicePlayerLike {
  /** Seconds. */
  readonly currentTime: number;
  volume: number;
  play(): void;
  pause(): void;
  seekTo(seconds: number): Promise<void>;
  setPlaybackRate(rate: number, quality?: 'low' | 'medium' | 'high'): void;
}

/** Media-clock poll while a slice plays. */
export const SLICE_POLL_MS = 20;
/** Wall-clock safety net on top of the media-clock stop: window / rate + this. */
export const SLICE_BACKSTOP_MS = 500;
/** Edge ramp length (volume stepped in/out so a cut never clicks). */
export const SLICE_RAMP_MS = 10;
/**
 * Muted-preroll seek compensation (T79 decision 3): seek this far BEFORE the
 * window, play muted, unmute at the window start. 0 = off. Defaults off: the
 * seek error has not been measured on a device yet (T83 measures; flip to
 * ~200 only if seekErrMs is > 20 ms p90).
 */
export const SLICE_SEEK_PREROLL_MS = 0;

export type SliceEndReason = 'media' | 'backstop' | 'stopped';

export interface SliceReport {
  leadInMs: number;
  leadOutMs: number;
  rate: number;
  /** currentTime (ms) right after seekTo resolved minus the seek target. */
  seekErrMs: number;
  /** Wall ms from play() to the first observed position advance; -1 if never. */
  startLatencyMs: number;
  /** Position read after pause minus the window end (ms); NaN-free: 0 when stopped/backstop-less. */
  stopLagMs: number;
  /** Position the stop fired at / after-pause position, for the log. */
  stopPosMs: number;
  reason: SliceEndReason;
}

export interface SliceRequest {
  window: SliceWindow;
  rate: number;
}

export interface SliceDeps {
  focus: SliceFocus;
  /** Players are lazily created by the hook; the controller asks each time. */
  getPlayer: () => SlicePlayerLike | null;
  now?: () => number;
  prerollMs?: number;
}

/**
 * One controller per surface. `play` resolves with a report when the slice
 * ends (media-clock stop, backstop, or stop()). Every path runs through
 * `finish`, which pauses, restores volume, releases T78 focus, and settles
 * the promise. A newer play()/stop() invalidates older ones via `seq`.
 */
export function createSliceController(deps: SliceDeps) {
  const now = deps.now ?? Date.now;
  const preroll = deps.prerollMs ?? SLICE_SEEK_PREROLL_MS;
  let seq = 0;
  let poll: ReturnType<typeof setInterval> | null = null;
  let backstop: ReturnType<typeof setTimeout> | null = null;
  let settle: ((r: SliceReport | null) => void) | null = null;
  let active: SlicePlayerLike | null = null;

  function clearTimers() {
    if (poll) clearInterval(poll);
    if (backstop) clearTimeout(backstop);
    poll = null;
    backstop = null;
  }

  function halt() {
    clearTimers();
    const p = active;
    active = null;
    if (p) {
      try {
        p.pause();
        p.volume = 1;
      } catch {
        /* player already released */
      }
    }
    deps.focus.release();
    const s = settle;
    settle = null;
    return { p, s };
  }

  function stop() {
    seq += 1;
    const { s } = halt();
    s?.(null);
  }

  async function play(req: SliceRequest): Promise<SliceReport | null> {
    stop();
    const player = deps.getPlayer();
    if (!player) return null;
    const mySeq = seq;
    const { window: w, rate } = req;
    const seekTargetMs = Math.max(0, w.startMs - preroll);
    const prerolling = w.startMs - seekTargetMs > 0;

    return new Promise<SliceReport | null>((resolve) => {
      settle = resolve;
      void (async () => {
        try {
          player.setPlaybackRate(rate, 'high');
          // T78: pause other apps (transient focus) before the first sample.
          await deps.focus.acquire();
          if (mySeq !== seq) return;
          await player.seekTo(seekTargetMs / 1000);
          if (mySeq !== seq) return;
          const seekErrMs = Math.round(player.currentTime * 1000 - seekTargetMs);
          active = player;
          player.volume = 0;
          const playedAt = now();
          player.play();

          let startLatencyMs = -1;
          let unmuted = false;
          let rampedOut = false;
          const basePos = player.currentTime * 1000;

          const unmute = () => {
            unmuted = true;
            // Two steps over SLICE_RAMP_MS: cheap, and the cut never clicks.
            player.volume = 0.5;
            setTimeout(() => {
              if (mySeq === seq && active === player) player.volume = 1;
            }, SLICE_RAMP_MS / 2);
          };

          const end = (reason: SliceEndReason) => {
            const readBefore = player.currentTime * 1000;
            const { s } = halt();
            const stopPosMs = Math.round(Math.max(readBefore, player.currentTime * 1000));
            s?.({
              leadInMs: w.leadInMs,
              leadOutMs: w.leadOutMs,
              rate,
              seekErrMs,
              startLatencyMs,
              stopLagMs: reason === 'media' ? Math.round(stopPosMs - w.endMs) : 0,
              stopPosMs,
              reason,
            });
          };

          backstop = setTimeout(
            () => {
              if (mySeq === seq) end('backstop');
            },
            Math.ceil((w.endMs - w.startMs) / rate) +
              (prerolling ? Math.ceil(preroll / rate) : 0) +
              SLICE_BACKSTOP_MS,
          );

          const tick = () => {
            if (mySeq !== seq) return;
            const posMs = player.currentTime * 1000;
            if (startLatencyMs < 0 && posMs > basePos + 1) startLatencyMs = now() - playedAt;
            if (!unmuted && prerolling && posMs >= w.startMs) unmute();
            if (!rampedOut && posMs >= w.endMs - SLICE_RAMP_MS) {
              rampedOut = true;
              if (posMs < w.endMs) player.volume = 0.4;
            }
            if (posMs >= w.endMs) end('media');
          };
          poll = setInterval(tick, SLICE_POLL_MS);
          if (!prerolling) unmute();
        } catch {
          if (mySeq === seq) {
            const { s } = halt();
            s?.(null);
          }
        }
      })();
    });
  }

  return { play, stop };
}

export type SliceController = ReturnType<typeof createSliceController>;
