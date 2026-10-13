/**
 * T79: pure window math for word / phrase / sentence slices cut from a
 * narration track. Replaces the fixed −40/+60 ms padding (T10/T14), which ran
 * into the NEXT word on 29 % of published stamps. All values are media-time
 * milliseconds; playback rate never changes a window (it only stretches the
 * wall-clock backstop).
 */

export interface SliceStamp {
  startMs: number;
  endMs: number;
}

export interface SliceWindow {
  /** Where to seek (media ms, >= 0). */
  startMs: number;
  /** Pause when the media clock reaches this. */
  endMs: number;
  leadInMs: number;
  leadOutMs: number;
}

export const LEAD_IN_MIN_MS = 15;
export const LEAD_IN_MAX_MS = 120;
export const LEAD_OUT_MIN_MS = 25;
export const LEAD_OUT_MAX_MS = 160;
/** A neighbour farther away than this counts as "sentence edge": take the maximum lead. */
export const EDGE_GAP_MS = 400;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * lead-in = clamp(gapBefore × 0.5, 15, 120); lead-out = clamp(gapAfter × 0.5, 25, 160);
 * never past the midpoint of the gap to a neighbour (so with no gap, or an
 * overlap the pipeline left behind, the lead is 0 rather than the minimum).
 * No neighbour, or one > 400 ms away, takes the maximum.
 */
export function sliceWindow(
  stamp: SliceStamp,
  prev?: SliceStamp | null,
  next?: SliceStamp | null,
): SliceWindow {
  let leadInMs = LEAD_IN_MAX_MS;
  if (prev) {
    const gap = stamp.startMs - prev.endMs;
    if (gap <= EDGE_GAP_MS)
      leadInMs = Math.max(0, Math.min(clamp(gap * 0.5, LEAD_IN_MIN_MS, LEAD_IN_MAX_MS), gap / 2));
  }
  let leadOutMs = LEAD_OUT_MAX_MS;
  if (next) {
    const gap = next.startMs - stamp.endMs;
    if (gap <= EDGE_GAP_MS)
      leadOutMs = Math.max(
        0,
        Math.min(clamp(gap * 0.5, LEAD_OUT_MIN_MS, LEAD_OUT_MAX_MS), gap / 2),
      );
  }
  // The track start is a hard edge: a lead-in cannot reach before 0.
  const startMs = Math.max(0, Math.round(stamp.startMs - leadInMs));
  return {
    startMs,
    endMs: Math.round(stamp.endMs + leadOutMs),
    leadInMs: Math.round(stamp.startMs - startMs),
    leadOutMs: Math.round(leadOutMs),
  };
}

/** Neighbour stamps of a contiguous run [first, last] inside a time-sorted stamp list. */
export interface RunNeighbours<T extends SliceStamp> {
  prev: T | null;
  next: T | null;
}

/**
 * `stamps` must be sorted by startMs. `inRun` selects the stamps being played
 * (one word, or every stamp of a sentence); the neighbours are the stamps
 * just outside the run.
 */
export function runSpan<T extends SliceStamp>(
  stamps: readonly T[],
  inRun: (s: T) => boolean,
): (SliceStamp & RunNeighbours<T>) | null {
  let first = -1;
  let last = -1;
  for (let i = 0; i < stamps.length; i++) {
    if (!inRun(stamps[i]!)) continue;
    if (first < 0) first = i;
    last = i;
  }
  if (first < 0) return null;
  let startMs = Infinity;
  let endMs = -Infinity;
  for (let i = first; i <= last; i++) {
    if (!inRun(stamps[i]!)) continue;
    startMs = Math.min(startMs, stamps[i]!.startMs);
    endMs = Math.max(endMs, stamps[i]!.endMs);
  }
  return { startMs, endMs, prev: stamps[first - 1] ?? null, next: stamps[last + 1] ?? null };
}
