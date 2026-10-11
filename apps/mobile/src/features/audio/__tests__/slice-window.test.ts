import { describe, expect, it } from 'vitest';

import { runSpan, sliceWindow } from '../slice-window';

const w = (startMs: number, endMs: number) => ({ startMs, endMs });

describe('sliceWindow', () => {
  it('uses half the gap, clamped, with room on both sides', () => {
    // gaps 100 / 200 -> leads 50 / 100
    const r = sliceWindow(w(1000, 1500), w(700, 900), w(1700, 2000));
    expect(r).toEqual({ startMs: 950, endMs: 1600, leadInMs: 50, leadOutMs: 100 });
  });

  it('clamps to max for big (but < 400 ms) gaps', () => {
    const r = sliceWindow(w(1000, 1500), w(400, 500), w(1900, 2000));
    expect(r.leadInMs).toBe(120);
    expect(r.leadOutMs).toBe(160);
  });

  it('never crosses the midpoint of a tight gap', () => {
    // 20 ms gaps: clamp floors (15/25) would exceed the midpoint (10).
    const r = sliceWindow(w(1000, 1500), w(900, 980), w(1520, 1600));
    expect(r.leadInMs).toBe(10);
    expect(r.leadOutMs).toBe(10);
    expect(r.startMs).toBeGreaterThanOrEqual(980);
    expect(r.endMs).toBeLessThanOrEqual(1520);
  });

  it('abutting or overlapping neighbours give zero lead', () => {
    const r = sliceWindow(w(1000, 1500), w(800, 1000), w(1450, 1800));
    expect(r.leadInMs).toBe(0);
    expect(r.leadOutMs).toBe(0);
    expect(r.startMs).toBe(1000);
    expect(r.endMs).toBe(1500);
  });

  it('sentence edges (no neighbour or > 400 ms away) take the maximum', () => {
    expect(sliceWindow(w(2000, 2400))).toMatchObject({ leadInMs: 120, leadOutMs: 160 });
    const far = sliceWindow(w(2000, 2400), w(500, 900), w(3500, 3900));
    expect(far).toMatchObject({ leadInMs: 120, leadOutMs: 160 });
  });

  it('first word of a track cannot seek before 0', () => {
    const r = sliceWindow(w(50, 400), null, w(450, 800));
    expect(r.startMs).toBe(0);
    expect(r.leadInMs).toBe(50);
    expect(r.leadOutMs).toBe(25);
  });

  it('is rate-independent (windows are media time)', () => {
    expect(sliceWindow(w(1000, 1500), w(700, 900), w(1700, 2000))).toEqual(
      sliceWindow(w(1000, 1500), w(700, 900), w(1700, 2000)),
    );
  });
});

describe('runSpan', () => {
  const stamps = [
    { startMs: 0, endMs: 100, id: 'a' },
    { startMs: 150, endMs: 300, id: 'b' },
    { startMs: 320, endMs: 500, id: 'c' },
    { startMs: 600, endMs: 700, id: 'd' },
  ];
  it('finds a word with its neighbours', () => {
    const r = runSpan(stamps, (s) => s.id === 'b')!;
    expect(r).toMatchObject({ startMs: 150, endMs: 300 });
    expect(r.prev?.id).toBe('a');
    expect(r.next?.id).toBe('c');
  });
  it('spans a multi-stamp run and leaves track edges null', () => {
    const r = runSpan(stamps, (s) => s.id === 'a' || s.id === 'b')!;
    expect(r).toMatchObject({ startMs: 0, endMs: 300, prev: null });
    expect(r.next?.id).toBe('c');
  });
  it('null when nothing matches', () => {
    expect(runSpan(stamps, () => false)).toBeNull();
  });
});
