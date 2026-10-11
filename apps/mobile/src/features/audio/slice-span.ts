import { runSpan, type SliceStamp } from './slice-window';

/** Span + outside neighbours of a run of stamps, as plain stamps (for plain-data audio sources). */
export function sliceWindowSpan<T extends SliceStamp>(
  sorted: readonly T[],
  inRun: (s: T) => boolean,
): { startMs: number; endMs: number; prev: SliceStamp | null; next: SliceStamp | null } | null {
  const r = runSpan(sorted, inRun);
  if (!r) return null;
  const strip = (s: SliceStamp | null) => (s ? { startMs: s.startMs, endMs: s.endMs } : null);
  return { startMs: r.startMs, endMs: r.endMs, prev: strip(r.prev), next: strip(r.next) };
}
