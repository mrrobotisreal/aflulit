import * as React from 'react';

import SherpaSpeech from '../../../../modules/sherpa-speech';
import { stashExamWav, transcodeQueue } from '@/features/scenario/recordings/transcode-queue';
import { transcribeWav } from '@/features/pronunciation/asr-service';
import { isAssistInstalled, transcribeWithAssist } from '@/features/pronunciation/assist-service';
import {
  cancelAttemptRecording,
  startAttemptRecording,
  stopAttemptRecording,
} from '@/features/pronunciation/recorder';
import { trackTorfl } from '@/services/analytics';
import { logError } from '@/services/error-log';

import type { SpeakingTask } from '../grading/speaking';
import type { TorflLevel } from '../level-profile';
import type { SpeakingAnswer, SpeakingWordStamp } from '../model';

/**
 * The exam recorder (T73, TORFL §8.4) — the glue between the pure engine's
 * `START_REC` / `STOP_REC` effects and the native recorder: it opens the
 * mic and (T77, «you start, you stop») stops it ONLY on «Готово» / release,
 * the task's hard cap (`capMs`, tasks 1 / 2; a task-3 answer is a FIXED
 * window the engine's deadline stops) or `STOP_REC`. There is NO endpointing:
 * a pause — however long — never ends a recording (Mitch's first sitting
 * was ruined by the M17 endpointer's 6 s no-speech / 1.6 s silence stops;
 * M17 scenarios keep theirs, TORFL never imports it). Moves the cache WAV into `recordings/exam/<attemptId>/`,
 * queues the Opus transcode, transcribes (Zipformer; + the Whisper assist
 * re-decode when installed) and hands the finished `SpeakingAnswer` back
 * through `onDone` (→ `REC_DONE`). A recording that captured nothing still
 * produces an answer with an empty transcript — the item was sat.
 *
 * One recording at a time; `cancel()` drops an in-flight recording without
 * an answer (quit / abandon).
 */

export type RecorderPhase = 'idle' | 'recording' | 'processing';

/** Why a TORFL recording ended (T77 analytics slugs; `hold` = hold-to-talk release, reported as `done`). */
export type StopReason = 'done' | 'cap' | 'deadline' | 'skip' | 'hold';

export interface RecorderStart {
  itemId: string;
  task: SpeakingTask;
  capMs: number;
  fixedWindow: boolean;
  /** Which recordings-root dir the file goes under (the attempt id). */
  attemptId: string;
  /** T75 (THE LEVEL RULE): the exam's level for `exam_recording_saved`; default A1. */
  level?: TorflLevel;
  /** T77: ms the candidate thought between the prompt ending and this tap (analytics). */
  waitMs?: number;
}

export interface ExamRecorder {
  phase: RecorderPhase;
  /** Normalized mic RMS 0..1 while recording. */
  level: number;
  /** Recording clock (ms since the mic opened); 0 while idle. */
  elapsedMs: number;
  /** The item being recorded / processed (null when idle). */
  itemId: string | null;
  start: (s: RecorderStart) => Promise<void>;
  /** «Готово» / the engine's STOP_REC: stop now; the answer follows through `onDone`. */
  stop: (reason?: StopReason) => void;
  cancel: () => Promise<void>;
}

export interface RecorderEvents {
  onDone: (itemId: string, answer: SpeakingAnswer) => void;
  /** A recording was saved to disk (`exam_recording_saved {task, ms, level}`). */
  onSaved?: (task: SpeakingTask, ms: number) => void;
}

function toStamps(words: { word: string; startMs: number; endMs: number }[]): SpeakingWordStamp[] {
  return words.map((w) => ({ w: w.word, s: Math.round(w.startMs), e: Math.round(w.endMs) }));
}

export function useExamRecorder(events: RecorderEvents): ExamRecorder {
  const [phase, setPhase] = React.useState<RecorderPhase>('idle');
  const [level, setLevel] = React.useState(0);
  const [elapsedMs, setElapsedMs] = React.useState(0);
  const [itemId, setItemId] = React.useState<string | null>(null);

  const eventsRef = React.useRef(events);
  React.useEffect(() => {
    eventsRef.current = events;
  });
  const phaseRef = React.useRef<RecorderPhase>('idle');
  const currentRef = React.useRef<RecorderStart | null>(null);
  const stoppingRef = React.useRef(false);
  const serialRef = React.useRef(0);

  const setPhaseBoth = React.useCallback((p: RecorderPhase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const finish = React.useCallback(
    async (reason: StopReason) => {
      const cur = currentRef.current;
      if (!cur || stoppingRef.current) return;
      stoppingRef.current = true;
      const serial = ++serialRef.current;
      setPhaseBoth('processing');
      const res = await stopAttemptRecording().catch(() => null);
      const wavUri = res
        ? res.path.startsWith('file://')
          ? res.path
          : `file://${res.path}`
        : null;
      const durationMs = res?.durationMs ?? 0;
      let transcript = '';
      let assistTranscript: string | undefined;
      let words: SpeakingWordStamp[] | undefined;
      let recordingPath: string | null = null;
      if (wavUri && durationMs > 0) {
        // Transcribe from the cache WAV FIRST (the move is instant; the decode is the slow part).
        try {
          const r = await transcribeWav(wavUri);
          transcript = r.text;
          words = toStamps(r.words);
        } catch (err) {
          logError('manual', err);
        }
        if (isAssistInstalled()) {
          try {
            assistTranscript = (await transcribeWithAssist(wavUri, 'ru')).text;
          } catch (err) {
            logError('manual', err);
          }
        }
        recordingPath = stashExamWav(cur.attemptId, cur.task, cur.itemId, wavUri);
        if (recordingPath) {
          eventsRef.current.onSaved?.(cur.task, durationMs);
          trackTorfl('exam_recording_saved', {
            task: cur.task,
            ms: durationMs,
            level: cur.level ?? 'A1',
          });
        }
      }
      if (serial !== serialRef.current) return; // cancelled meanwhile
      trackTorfl('exam_speaking_rec_stopped', {
        task: cur.task,
        level: cur.level ?? 'A1',
        reason: reason === 'hold' ? 'done' : reason,
        durationMs,
      });
      const answer: SpeakingAnswer = {
        kind:
          cur.task === 3
            ? 'speaking-monologue'
            : cur.task === 2
              ? 'speaking-situation'
              : 'speaking-reply',
        transcript,
        ...(assistTranscript !== undefined ? { assistTranscript } : {}),
        ...(words && words.length > 0 ? { words } : {}),
        recordingPath,
        durationMs,
      };
      currentRef.current = null;
      stoppingRef.current = false;
      setPhaseBoth('idle');
      setItemId(null);
      setLevel(0);
      setElapsedMs(0);
      eventsRef.current.onDone(cur.itemId, answer);
    },
    [setPhaseBoth],
  );

  const start = React.useCallback(
    async (s: RecorderStart) => {
      if (phaseRef.current !== 'idle') {
        await cancelAttemptRecording().catch(() => undefined);
      }
      currentRef.current = s;
      stoppingRef.current = false;
      setElapsedMs(0);
      setItemId(s.itemId);
      setPhaseBoth('recording');
      try {
        await startAttemptRecording();
        trackTorfl('exam_speaking_rec_started', {
          task: s.task,
          level: s.level ?? 'A1',
          waitMs: Math.max(0, Math.round(s.waitMs ?? 0)),
        });
      } catch (err) {
        logError('manual', err);
        currentRef.current = null;
        setPhaseBoth('idle');
        setItemId(null);
        // The mic failed to open: the item gets an empty answer so the exam moves on.
        eventsRef.current.onDone(s.itemId, {
          kind:
            s.task === 3
              ? 'speaking-monologue'
              : s.task === 2
                ? 'speaking-situation'
                : 'speaking-reply',
          transcript: '',
          recordingPath: null,
          durationMs: 0,
        });
      }
    },
    [setPhaseBoth],
  );

  const stop = React.useCallback(
    (reason: StopReason = 'done') => {
      if (phaseRef.current !== 'recording') return;
      void finish(reason);
    },
    [finish],
  );

  const cancel = React.useCallback(async () => {
    serialRef.current += 1;
    currentRef.current = null;
    stoppingRef.current = false;
    if (phaseRef.current === 'recording') await cancelAttemptRecording().catch(() => undefined);
    setElapsedMs(0);
    setPhaseBoth('idle');
    setItemId(null);
    setLevel(0);
  }, [setPhaseBoth]);

  // Level events drive the meter + the clock, and the CAP (tasks 1 / 2). Silence is never a stop.
  React.useEffect(() => {
    const sub = SherpaSpeech.addListener('onRecordingLevel', ({ level: l, elapsedMs: ms }) => {
      setLevel(l);
      if (phaseRef.current !== 'recording') return;
      setElapsedMs(ms);
      const cur = currentRef.current;
      if (cur && !cur.fixedWindow && cur.capMs > 0 && ms >= cur.capMs) void finish('cap');
    });
    return () => sub.remove();
  }, [finish]);

  // Unmount: drop whatever is running (the engine's RESUME skips the item).
  React.useEffect(
    () => () => {
      serialRef.current += 1;
      if (phaseRef.current === 'recording') void cancelAttemptRecording().catch(() => undefined);
    },
    [],
  );

  return { phase, level, elapsedMs, itemId, start, stop, cancel };
}

/** Enqueue the Opus transcode of a saved exam recording (the executor calls it once the response row exists). */
export function enqueueExamTranscode(attemptId: string, responseId: string, wavName: string): void {
  transcodeQueue().enqueue({ runId: attemptId, attemptId: responseId, wavName, root: 'exam' });
}
