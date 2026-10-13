import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSliceController, type SlicePlayerLike } from '../slice-controller';

function fakePlayer(opts: { seekLandsMs?: number; advance?: boolean } = {}) {
  let t = 0; // media ms
  const log: string[] = [];
  let playing = false;
  let clock: ReturnType<typeof setInterval> | null = null;
  const p: SlicePlayerLike & { log: string[]; playing: () => boolean } = {
    log,
    playing: () => playing,
    get currentTime() {
      return t / 1000;
    },
    volume: 1,
    play() {
      playing = true;
      log.push('play');
      if (opts.advance !== false) clock = setInterval(() => (t += 10), 10);
    },
    pause() {
      playing = false;
      log.push('pause');
      if (clock) clearInterval(clock);
      clock = null;
    },
    async seekTo(s) {
      t = opts.seekLandsMs ?? s * 1000;
      log.push(`seek:${Math.round(s * 1000)}`);
    },
    setPlaybackRate(r) {
      log.push(`rate:${r}`);
    },
  };
  return p;
}

function fakeFocus() {
  const f = {
    acquired: 0,
    released: 0,
    acquire: async () => void f.acquired++,
    release: () => void f.released++,
  };
  return f;
}

const win = { startMs: 1000, endMs: 1300, leadInMs: 40, leadOutMs: 60 };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createSliceController', () => {
  it('stops on the media clock at the window end and reports seek error + lag', async () => {
    const player = fakePlayer({ seekLandsMs: 1012 });
    const focus = fakeFocus();
    const c = createSliceController({ focus, getPlayer: () => player });
    const done = c.play({ window: win, rate: 1 });
    await vi.advanceTimersByTimeAsync(1000);
    const r = (await done)!;
    expect(r.reason).toBe('media');
    expect(r.seekErrMs).toBe(12);
    expect(r.stopLagMs).toBeLessThanOrEqual(30);
    expect(r.stopPosMs).toBeGreaterThanOrEqual(1300);
    expect(player.log.at(-1)).toBe('pause');
    expect(focus.acquired).toBe(1);
    expect(focus.released).toBeGreaterThanOrEqual(1);
    expect(player.volume).toBe(1);
  });

  it('wall-clock backstop fires when the position never advances', async () => {
    const player = fakePlayer({ advance: false });
    const focus = fakeFocus();
    const c = createSliceController({ focus, getPlayer: () => player });
    const done = c.play({ window: win, rate: 0.7 });
    await vi.advanceTimersByTimeAsync(2000);
    const r = (await done)!;
    expect(r.reason).toBe('backstop');
    expect(r.startLatencyMs).toBe(-1);
    expect(player.playing()).toBe(false);
    expect(focus.released).toBeGreaterThanOrEqual(1);
  });

  it('stop() mid-slice pauses, releases focus, resolves null', async () => {
    const player = fakePlayer();
    const focus = fakeFocus();
    const c = createSliceController({ focus, getPlayer: () => player });
    const done = c.play({ window: win, rate: 1 });
    await vi.advanceTimersByTimeAsync(100);
    c.stop();
    expect(await done).toBeNull();
    expect(player.playing()).toBe(false);
    const releasedAfter = focus.released;
    await vi.advanceTimersByTimeAsync(2000);
    expect(focus.released).toBe(releasedAfter); // no timers left over
  });

  it('stop() before focus resolves never seeks or plays (seq check)', async () => {
    const player = fakePlayer();
    const focus = fakeFocus();
    const c = createSliceController({ focus, getPlayer: () => player });
    const done = c.play({ window: win, rate: 1 });
    c.stop();
    await vi.advanceTimersByTimeAsync(500);
    expect(await done).toBeNull();
    expect(player.log.some((l) => l === 'play' || l.startsWith('seek'))).toBe(false);
  });

  it('a second play supersedes the first', async () => {
    const player = fakePlayer();
    const focus = fakeFocus();
    const c = createSliceController({ focus, getPlayer: () => player });
    const first = c.play({ window: win, rate: 1 });
    await vi.advanceTimersByTimeAsync(50);
    const second = c.play({ window: { ...win, startMs: 2000, endMs: 2200 }, rate: 1 });
    expect(await first).toBeNull();
    await vi.advanceTimersByTimeAsync(2000);
    expect((await second)?.reason).toBe('media');
  });

  it('muted preroll: seeks early, unmutes at the window start', async () => {
    const player = fakePlayer();
    const seen: number[] = [];
    const focus = fakeFocus();
    const c = createSliceController({ focus, getPlayer: () => player, prerollMs: 200 });
    const done = c.play({ window: win, rate: 1 });
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 40; i++) {
      await vi.advanceTimersByTimeAsync(10);
      seen.push(player.volume);
    }
    expect(player.log).toContain('seek:800');
    expect(seen[0]).toBe(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect((await done)?.reason).toBe('media');
  });

  it('a throwing player resolves null and releases focus', async () => {
    const player = fakePlayer();
    player.seekTo = async () => {
      throw new Error('released');
    };
    const focus = fakeFocus();
    const c = createSliceController({ focus, getPlayer: () => player });
    const done = c.play({ window: win, rate: 1 });
    await vi.advanceTimersByTimeAsync(10);
    expect(await done).toBeNull();
    expect(focus.released).toBeGreaterThanOrEqual(1);
  });
});
