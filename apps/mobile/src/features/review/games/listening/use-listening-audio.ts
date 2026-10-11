import * as React from 'react';

import { useSlicePlayer } from '@/features/audio/use-slice-player';
import { track } from '@/services/analytics';
import { getSpeechService } from '@/services/speech';

import type { ListeningAudio } from './audio-source';

/** Slow-replay rate — matches the narration bar's lowest speed (T10). */
export const SLOW_REPLAY_RATE = 0.7;

/**
 * Playback for one listening-quiz item (T14). Segment sources play through
 * the shared T79 slice player (neighbour-aware window, media-clock stop,
 * T78 focus held for the slice); TTS sources go through the SpeechService
 * (Piper when a voice is installed, system voice otherwise — never network).
 * Slow replay drops the rate to 0.7× on both paths. Auto-plays once on mount.
 * `playContext` (segment only) plays the whole source sentence.
 */
export function useListeningAudio(audio: ListeningAudio) {
  const slice = useSlicePlayer('listening', 'listening-quiz');
  const { stop: stopSlice } = slice;

  const stop = React.useCallback(() => {
    stopSlice();
    void getSpeechService().stop();
  }, [stopSlice]);

  const play = React.useCallback(
    (slow: boolean) => {
      stop();
      const rate = slow ? SLOW_REPLAY_RATE : 1;
      if (audio.kind === 'tts') {
        void getSpeechService().speak(audio.text, { rate });
        return;
      }
      void slice.play(
        {
          uri: audio.uri,
          startMs: audio.startMs,
          endMs: audio.endMs,
          prev: audio.prev,
          next: audio.next,
        },
        rate,
      );
    },
    [audio, stop, slice],
  );

  const hasContext = audio.kind === 'segment' && audio.context != null;
  const playContext = React.useCallback(() => {
    if (audio.kind !== 'segment' || !audio.context) return;
    stop();
    const c = audio.context;
    track('word_slice_context_played', { surface: 'listening' });
    void slice.play(
      { uri: audio.uri, startMs: c.startMs, endMs: c.endMs, prev: c.prev, next: c.next },
      1,
    );
  }, [audio, stop, slice]);

  // Auto-play the clip once the item appears — the audio IS the prompt.
  React.useEffect(() => {
    const timer = setTimeout(() => play(false), 350);
    return () => clearTimeout(timer);
    // play is stable per item (audio identity); the view remounts per item.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Slice player teardown (pause, focus release, player.remove) lives in useSlicePlayer;
  // this effect only silences TTS on unmount.
  React.useEffect(() => {
    return () => {
      void getSpeechService().stop();
    };
  }, []);

  return { play, stop, playContext, hasContext };
}
