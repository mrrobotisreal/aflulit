import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Speech from 'expo-speech';

import { setFocusBackendForTests } from '@/services/learning-focus';

import { speakWithInfo, stopSpeaking } from '../service';

vi.mock('expo-speech', () => ({ speak: vi.fn(), stop: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../../../modules/sherpa-speech', () => ({ default: { stop: vi.fn() } }));
vi.mock('@/db', () => ({ repos: {} }));
vi.mock('@/services/analytics', () => ({ track: vi.fn() }));
vi.mock('../manager', () => ({
  isVoiceInstalled: vi.fn(),
  refreshInstalledVoices: vi.fn(),
  voiceModelPaths: vi.fn(),
}));

describe('system TTS holds transient focus around the clip', () => {
  const calls: string[] = [];
  const backend = {
    requestTransientFocus: vi.fn(async () => {
      calls.push('request');
      return 'granted' as const;
    }),
    abandonTransientFocus: vi.fn(() => {
      calls.push('abandon');
    }),
  };

  beforeEach(async () => {
    setFocusBackendForTests(backend);
    await stopSpeaking();
    calls.length = 0;
    vi.clearAllMocks();
    vi.mocked(Speech.speak).mockImplementation(() => {
      calls.push('speak');
    });
  });

  it('requests focus before speaking and abandons on done', async () => {
    await speakWithInfo('один');
    expect(calls).toEqual(['request', 'speak']);
    vi.mocked(Speech.speak).mock.calls[0]![1]!.onDone?.();
    expect(calls).toEqual(['request', 'speak', 'abandon']);
  });

  it('abandons on error and on stop', async () => {
    await speakWithInfo('два');
    vi.mocked(Speech.speak).mock.calls[0]![1]!.onError?.(new Error('x'));
    expect(calls.at(-1)).toBe('abandon');
    calls.length = 0;
    await speakWithInfo('три');
    await stopSpeaking();
    expect(calls).toEqual(['request', 'speak', 'abandon']);
  });

  it('a replay releases the previous hold exactly once', async () => {
    await speakWithInfo('раз');
    await speakWithInfo('два');
    expect(calls.filter((c) => c === 'abandon')).toHaveLength(1);
    expect(calls.filter((c) => c === 'request')).toHaveLength(2);
  });
});
