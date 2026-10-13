import { Ionicons } from '@expo/vector-icons';
import type {
  ExamItem,
  ExamSubtest,
  SpeakingMonologueItem,
  SpeakingTurnItem,
} from '@aflulit/schema';
import * as React from 'react';
import { Alert, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { repos } from '@/db';
import { MicButton, type MicVisualState } from '@/features/scenario/stage/mic-button';
import { cn } from '@/lib/cn';
import { trackTorfl } from '@/services/analytics';
import { useAppTheme } from '@/theme/use-app-theme';

import { instructionCopy, type Lang } from '../copy';
import { useInstructionLang } from '../instruction-lang';
import { LangToggle } from '../lang-toggle';
import { fileExists } from '../drill/drill-item';
import { monologueWindows, speakingCapMsFor, type ExamRunState } from '../engine/exam-machine';
import { formatClock, timerTone } from '../engine/rules';
import { TASK_LABEL, speakingTaskOf } from '../grading/speaking';
import { loadRefAudio, type ExamAudio } from '../items/exam-audio';
import { useExamAudio } from '../items/use-exam-audio';
import type { ExamSpeakingState } from '../model';
import type { TorflLevel } from '../level-profile';
import { WritingLookupSheet } from '../writing/lookup-sheet';
import { chooseLine, minutesLang, sentencesLine, task3Fact } from './timing-copy';
import type { ExamRecorder } from './use-exam-recorder';

const TIMER_TONE_CLASS = {
  normal: 'text-text',
  amber: 'text-track-warm',
  red: 'text-danger',
} as const;

/** The 10 s warning before a task-3 answer window closes (§8.4). */
const ANSWER_WARN_MS = 10_000;

/**
 * The Говорение mock runner (T73, TORFL §8.4) — the `running` phase of a
 * speaking subtest, rendered from `state.speaking`:
 *
 * - **task 1 / 2** — the part instruction, the examiner line plays ONCE on
 *   entry (task 2 also shows the situation text), then the item WAITS in
 *   `ready` (T77: no timer, no auto-open) until the candidate taps the mic;
 *   a recording ends only on «Готово» or the task cap (a countdown shows in
 *   the last 10 s) — never on a pause. «Пропустить».
 * - **task 3** — `choose`: two topic cards; `prep`: the chosen topic's
 *   questions, a notes field (local only — never graded, never persisted),
 *   lookup (decision 8) and the 8:00 clock, «Готов» ends prep early;
 *   `ready-answer`: «Начать ответ» (the window starts at his tap);
 *   `answer`: the fixed window with the mic ring, a 10 s warning, «Готово».
 * - **T77:** every INSTRUCTION string flips RU ⇄ EN with the header toggle;
 *   examiner lines, situations, topics and questions stay Russian.
 * - the top bar shows the subtest timer; the part / window clock sits in
 *   the body (both wall-clock, from the engine).
 *
 * No correctness, no transcript, no retries, no lifelines (decision 4).
 */
export function ExamSpeakingScreen({
  packId,
  attemptId,
  level = 'A1',
  subtest,
  run,
  remainingMs,
  windowMs,
  recorder,
  lookup,
  onAudioEnded,
  onChoose,
  onPrepDone,
  onTapRec,
  onSkip,
  onStopEarly,
  onQuit,
}: {
  packId: string;
  attemptId: string;
  /** T75 (THE LEVEL RULE): the exam's level for `exam_lookup_used`. */
  level?: TorflLevel;
  subtest: ExamSubtest;
  run: Pick<ExamRunState, 'speaking'>;
  remainingMs: number;
  /** The current window / part clock (engine `speakingWindowMs`). */
  windowMs: number;
  recorder: ExamRecorder;
  /** The dictionary rule for task-3 prep. */
  lookup: boolean;
  onAudioEnded: () => void;
  onChoose: (itemId: string) => void;
  onPrepDone: () => void;
  /** T77: the candidate tapped the mic / «Начать ответ». */
  onTapRec: () => void;
  onSkip: () => void;
  /** The candidate ended a recording by hand («Готово»). */
  onStopEarly: () => void;
  onQuit: () => void;
}) {
  const { tokens } = useAppTheme();
  const insets = useSafeAreaInsets();
  const lang = useInstructionLang();
  const c = instructionCopy(lang);
  const sp = run.speaking;
  const tone = timerTone(remainingMs);
  void attemptId;

  if (!sp) return null;
  const part = subtest.parts[sp.partIdx ?? 0];
  const items = part?.items ?? [];
  const item = sp.itemId ? (items.find((i) => i.id === sp.itemId) ?? null) : null;
  const total = subtest.parts.reduce((n, p) => n + p.items.length, 0);
  const position = (() => {
    let n = 0;
    for (const p of subtest.parts) {
      for (const i of p.items) {
        n += 1;
        if (i.id === sp.itemId) return n;
      }
    }
    return n;
  })();

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top + 4 }} testID="exam-speaking">
      {/* top bar */}
      <View className="flex-row items-center gap-2 px-3 pb-2">
        <Pressable
          onPress={onQuit}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={c.quitExam}
          testID="speaking-quit"
          className="h-10 w-10 items-center justify-center rounded-full active:bg-surface-2"
        >
          <Ionicons name="close" size={22} color={tokens.textMuted} />
        </Pressable>
        <View className="flex-1">
          <Text className="font-ui-medium" numberOfLines={1}>
            {c.speaking} · {TASK_LABEL[sp.task as 1 | 2 | 3][lang]}
          </Text>
          <Text variant="caption" className="text-xs">
            {sp.itemId ? c.taskOf(position, total) : c.chooseTopic}
          </Text>
        </View>
        <LangToggle screen="speaking" level={level} />
        <Text
          className={cn('font-ui-bold text-lg tabular-nums', TIMER_TONE_CLASS[tone])}
          testID="exam-timer"
          accessibilityLabel={c.timeLeftA11y(formatClock(remainingMs))}
        >
          {formatClock(remainingMs)}
        </Text>
      </View>

      {sp.task === 3 ? (
        <MonologueBody
          packId={packId}
          level={level}
          sp={sp}
          items={items}
          item={item && item.kind === 'speaking-monologue' ? item : null}
          windowMs={windowMs}
          recorder={recorder}
          lookup={lookup}
          lang={lang}
          onChoose={onChoose}
          onPrepDone={onPrepDone}
          onTapRec={onTapRec}
          onSkip={onSkip}
          onStopEarly={onStopEarly}
          bottom={insets.bottom}
        />
      ) : item && (item.kind === 'speaking-reply' || item.kind === 'speaking-situation') ? (
        <TurnBody
          key={item.id}
          packId={packId}
          part={part!}
          item={item}
          sp={sp}
          level={level}
          lang={lang}
          windowMs={windowMs}
          recorder={recorder}
          onAudioEnded={onAudioEnded}
          onTapRec={onTapRec}
          onSkip={onSkip}
          onStopEarly={onStopEarly}
          bottom={insets.bottom}
        />
      ) : null}
    </View>
  );
}

// --- tasks 1–2 --------------------------------------------------------------------------------

function TurnBody({
  packId,
  part,
  item,
  sp,
  level,
  lang,
  windowMs,
  recorder,
  onAudioEnded,
  onTapRec,
  onSkip,
  onStopEarly,
  bottom,
}: {
  packId: string;
  part: ExamSubtest['parts'][number];
  item: SpeakingTurnItem;
  sp: ExamSpeakingState;
  level: TorflLevel;
  lang: Lang;
  windowMs: number;
  recorder: ExamRecorder;
  onAudioEnded: () => void;
  onTapRec: () => void;
  onSkip: () => void;
  onStopEarly: () => void;
  bottom: number;
}) {
  const { tokens } = useAppTheme();
  const c = instructionCopy(lang);
  const [audio, setAudio] = React.useState<ExamAudio | null | undefined>(undefined);

  // The examiner's line / the situation: one story ref → audio span (TTS fallback is allowed here —
  // the examiner's voice is not a listening test; the «синтез» badge says so).
  React.useEffect(() => {
    let cancelled = false;
    void loadRefAudio(repos.content, packId, item.prompt, fileExists)
      .then((a) => {
        if (!cancelled) setAudio(a);
      })
      .catch(() => {
        if (!cancelled) setAudio(null);
      });
    return () => {
      cancelled = true;
    };
    // keyed on the item
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packId, item.id]);

  const endedRef = React.useRef(false);
  const onEnded = React.useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    onAudioEnded();
  }, [onAudioEnded]);
  const controls = useExamAudio(audio ?? null, { onEnded });

  // Play once on entry (the tester says it once). A missing story → no audio → straight to `ready`.
  const playedRef = React.useRef(false);
  React.useEffect(() => {
    if (sp.phase !== 'prompt' || playedRef.current) return;
    if (audio === undefined) return;
    playedRef.current = true;
    if (audio === null) {
      onEnded();
      return;
    }
    const t = setTimeout(() => controls.play(1), 400);
    return () => clearTimeout(t);
    // once per item once the audio resolved
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audio, sp.phase]);

  // T77: `ready` = the prompt ended, the item waits (no timer) for his tap; `recording` = the mic is
  // open until «Готово» / the task cap. The cap clock is `windowMs` (the engine's phase deadline).
  const waiting = sp.phase === 'ready';
  const recording = sp.phase === 'recording' && recorder.phase === 'recording';
  const processing = sp.phase === 'processing' || recorder.phase === 'processing';
  const micState: MicVisualState = recording
    ? 'recording'
    : processing
      ? 'processing'
      : waiting
        ? 'ready'
        : 'disabled';
  const capSec = Math.round(speakingCapMsFor(level, sp.task as 1 | 2) / 1000);
  const capLeftSec = Math.ceil(windowMs / 1000);
  const warn = recording && capLeftSec <= 10;
  const elapsed = formatClock(recorder.elapsedMs);
  const windowTone = timerTone(windowMs + 240_000); // the part clock: amber under 1:00 only

  return (
    <>
      <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 pb-6 pt-2">
        <Text variant="caption" className="px-1" testID="part-instructions">
          {part.instructions[lang]}
        </Text>
        <View
          className="gap-3 rounded-2xl border border-border bg-surface px-4 py-4"
          testID="speaking-prompt"
        >
          <View className="flex-row items-center gap-3">
            <View className="h-12 w-12 items-center justify-center rounded-full bg-accent-soft">
              <Ionicons
                name={controls.playing ? 'volume-high' : 'person-outline'}
                size={22}
                color={tokens.accent}
              />
            </View>
            <View className="flex-1">
              <Text className="font-ui-medium">
                {sp.phase === 'prompt'
                  ? controls.playing
                    ? c.examinerSpeaking
                    : c.listenExaminer
                  : recording
                    ? c.recordingHeading
                    : processing
                      ? c.savingHeading
                      : waiting
                        ? c.readyHeading
                        : c.answerHeading}
              </Text>
              <Text variant="caption">
                {item.kind === 'speaking-reply' ? c.replyCaption : c.situationCaption}
                {audio?.synthetic ? c.synthetic : ''}
              </Text>
            </View>
          </View>
          {item.kind === 'speaking-situation' && item.situation ? (
            <Text className="font-reading text-lg leading-8" testID="speaking-situation">
              {item.situation.ru}
            </Text>
          ) : null}
        </View>
        <View className="flex-row items-center justify-between px-1">
          {recording ? (
            <>
              <Text variant="caption">{c.recordingCap(capSec)}</Text>
              <Text
                className={cn('font-ui-bold tabular-nums', warn ? 'text-danger' : 'text-text')}
                testID="speaking-rec-clock"
              >
                {warn ? c.secondsLeft(Math.max(0, capLeftSec)) : elapsed}
              </Text>
            </>
          ) : waiting || sp.phase === 'prompt' ? (
            <>
              <Text variant="caption">{c.partClock}</Text>
              <Text className={cn('font-ui-bold tabular-nums', TIMER_TONE_CLASS[windowTone])}>
                {formatClock(windowMs)}
              </Text>
            </>
          ) : null}
        </View>
      </ScrollView>
      <View
        className="items-center gap-3 border-t border-border bg-bg px-4 pt-3"
        style={{ paddingBottom: bottom + 12 }}
      >
        <MicButton
          state={micState}
          level={recorder.level}
          holdPrimary={false}
          onTap={() => {
            if (waiting) onTapRec();
            else if (recording) onStopEarly();
          }}
          // A long press only STARTS (never stops on release): you start, you stop.
          onHoldStart={() => {
            if (waiting) onTapRec();
          }}
          onHoldEnd={() => undefined}
        />
        <Text variant="caption" testID="speaking-mic-hint">
          {recording
            ? c.recordingHint
            : processing
              ? c.recognising
              : waiting
                ? c.tapMicHint
                : c.listenExaminer}
        </Text>
        {recording ? (
          <Pressable
            onPress={onStopEarly}
            accessibilityRole="button"
            testID="speaking-finish"
            className="min-w-[160px] items-center rounded-full bg-accent px-6 py-3 active:opacity-80"
          >
            <Text className="font-ui-bold text-bg">{c.done}</Text>
          </Pressable>
        ) : null}
        {!processing && !recording ? (
          <Pressable
            onPress={() =>
              Alert.alert(c.skipTaskTitle, c.skipTaskBody, [
                { text: c.returnBtn, style: 'cancel' },
                { text: c.skipTask, style: 'destructive', onPress: onSkip },
              ])
            }
            accessibilityRole="button"
            testID="speaking-skip"
            className="py-1"
          >
            <Text className="font-ui-medium text-text-muted">{c.skipArrow}</Text>
          </Pressable>
        ) : null}
      </View>
    </>
  );
}

// --- task 3 -------------------------------------------------------------------------------------

function MonologueBody({
  packId,
  level,
  sp,
  items,
  item,
  windowMs,
  recorder,
  lookup,
  lang,
  onChoose,
  onPrepDone,
  onTapRec,
  onSkip,
  onStopEarly,
  bottom,
}: {
  packId: string;
  level: TorflLevel;
  sp: ExamSpeakingState;
  items: readonly ExamItem[];
  item: SpeakingMonologueItem | null;
  windowMs: number;
  recorder: ExamRecorder;
  lookup: boolean;
  lang: Lang;
  onChoose: (itemId: string) => void;
  onPrepDone: () => void;
  onTapRec: () => void;
  onSkip: () => void;
  onStopEarly: () => void;
  bottom: number;
}) {
  const { tokens } = useAppTheme();
  const c = instructionCopy(lang);
  const [notes, setNotes] = React.useState('');
  const [lookupOpen, setLookupOpen] = React.useState(false);
  void packId;
  const topics = items.filter((i): i is SpeakingMonologueItem => i.kind === 'speaking-monologue');

  if (sp.phase === 'choose') {
    return (
      <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 pb-10 pt-2">
        <Text variant="caption" className="px-1" testID="speaking-choose-line">
          {chooseLine(
            topics.length,
            monologueWindows(level, topics[0] ?? {}).prepSec,
            monologueWindows(level, topics[0] ?? {}).answerSec,
            lang,
          )}
        </Text>
        {topics.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => onChoose(t.id)}
            accessibilityRole="button"
            testID={`speaking-topic-${t.id}`}
            className="gap-2 rounded-2xl border border-border bg-surface px-4 py-4 active:bg-surface-2"
          >
            <Text className="font-reading-bold text-xl">{t.topicTitle.ru}</Text>
            <Text variant="caption">{t.topicTitle.en}</Text>
            <Text variant="caption">
              {c.topicStats(t.questions.length, t.minSentences, t.maxSentences)}
            </Text>
          </Pressable>
        ))}
        <Pressable
          onPress={() =>
            Alert.alert(c.skipMonologueTitle, c.skipMonologueBody, [
              { text: c.returnBtn, style: 'cancel' },
              { text: c.skipTask, style: 'destructive', onPress: onSkip },
            ])
          }
          accessibilityRole="button"
          testID="speaking-skip"
          className="items-center py-2"
        >
          <Text className="font-ui-medium text-text-muted">{c.skipArrow}</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (!item) return null;

  if (sp.phase === 'prep') {
    const tone = timerTone(windowMs);
    return (
      <>
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-4 px-4 pb-6 pt-2"
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-row items-center justify-between px-1">
            <Text variant="caption">{c.preparation}</Text>
            <Text
              className={cn('font-ui-bold text-lg tabular-nums', TIMER_TONE_CLASS[tone])}
              testID="speaking-prep-clock"
            >
              {formatClock(windowMs)}
            </Text>
          </View>
          <View className="gap-3 rounded-2xl border border-border bg-surface px-4 py-4">
            <Text className="font-reading-bold text-2xl" testID="speaking-topic-title">
              {item.topicTitle.ru}
            </Text>
            <View className="gap-1.5">
              {item.questions.map((q, i) => (
                <Text key={i} className="font-reading text-lg leading-7">
                  {i + 1}. {q.ru}
                </Text>
              ))}
            </View>
            <Text variant="caption">
              {sentencesLine(item.minSentences, item.maxSentences, lang)}
            </Text>
          </View>
          <View className="gap-2">
            <View className="flex-row items-center justify-between px-1">
              <Text variant="caption">{c.notesNotGraded}</Text>
              {lookup ? (
                <Pressable
                  onPress={() => setLookupOpen(true)}
                  accessibilityRole="button"
                  testID="speaking-lookup"
                  className="flex-row items-center gap-1.5 rounded-full border border-border px-3 py-1.5 active:bg-surface-2"
                >
                  <Ionicons name="book-outline" size={14} color={tokens.accent} />
                  <Text className="font-ui-medium text-sm text-accent">{c.dictionary}</Text>
                </Pressable>
              ) : null}
            </View>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              multiline
              textAlignVertical="top"
              placeholder={c.notesPlaceholder}
              placeholderTextColor={tokens.textMuted}
              testID="speaking-notes"
              className="min-h-[140px] rounded-2xl border border-border bg-surface px-4 py-3 font-reading text-base leading-6 text-text"
            />
          </View>
        </ScrollView>
        <View
          className="gap-2 border-t border-border bg-bg px-4 pt-3"
          style={{ paddingBottom: bottom + 12 }}
        >
          <Pressable
            onPress={() =>
              Alert.alert(
                c.prepConfirmTitle,
                c.prepConfirmBody(minutesLang(monologueWindows(level, item).answerSec, lang)),
                [
                  { text: c.morePrep, style: 'cancel' },
                  { text: c.ready, onPress: onPrepDone },
                ],
              )
            }
            accessibilityRole="button"
            testID="speaking-prep-done"
            className="items-center rounded-full bg-accent px-5 py-3.5 active:opacity-80"
          >
            <Text className="font-ui-bold text-bg">{c.prepDone}</Text>
          </Pressable>
        </View>
        <WritingLookupSheet
          open={lookupOpen}
          initialQuery=""
          subtestKind="speaking"
          level={level}
          onClose={() => setLookupOpen(false)}
        />
      </>
    );
  }

  // ready-answer / answer / processing
  const waiting = sp.phase === 'ready-answer';
  const recording = sp.phase === 'answer' && recorder.phase === 'recording';
  const processing = sp.phase === 'processing' || recorder.phase === 'processing';
  const answerSec = monologueWindows(level, item ?? {}).answerSec;
  const warn = recording && windowMs <= ANSWER_WARN_MS;
  return (
    <>
      <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 pb-6 pt-2">
        <View className="flex-row items-center justify-between px-1">
          <Text variant="caption">{waiting ? c.startAnswer : c.answer}</Text>
          {recording ? (
            <Text
              className={cn(
                'font-ui-bold text-lg tabular-nums',
                warn ? 'text-danger' : 'text-text',
              )}
              testID="speaking-answer-clock"
            >
              {formatClock(windowMs)}
            </Text>
          ) : null}
        </View>
        <View className="gap-3 rounded-2xl border border-border bg-surface px-4 py-4">
          <Text className="font-reading-bold text-2xl">{item.topicTitle.ru}</Text>
          <View className="gap-1">
            {item.questions.map((q, i) => (
              <Text key={i} variant="muted" className="font-reading leading-6">
                {i + 1}. {q.ru}
              </Text>
            ))}
          </View>
        </View>
        {waiting ? (
          <Text className="px-1" testID="speaking-ready-answer">
            {c.startAnswerHint(minutesLang(answerSec, lang))}
          </Text>
        ) : null}
        {warn ? (
          <Text className="px-1 font-ui-medium text-danger" testID="speaking-answer-warning">
            {c.warn10}
          </Text>
        ) : null}
        {notes.trim().length > 0 ? (
          <View className="rounded-2xl border border-border bg-surface-2 px-4 py-3">
            <Text variant="caption" className="mb-1">
              {c.yourNotes}
            </Text>
            <Text className="font-reading leading-6">{notes}</Text>
          </View>
        ) : null}
      </ScrollView>
      <View
        className="items-center gap-3 border-t border-border bg-bg px-4 pt-3"
        style={{ paddingBottom: bottom + 12 }}
      >
        <MicButton
          state={
            recording ? 'recording' : processing ? 'processing' : waiting ? 'ready' : 'disabled'
          }
          level={recorder.level}
          holdPrimary={false}
          onTap={() => {
            if (waiting) onTapRec();
            else if (recording) onStopEarly();
          }}
          onHoldStart={() => {
            if (waiting) onTapRec();
          }}
          onHoldEnd={() => undefined}
        />
        <Text variant="caption" testID="speaking-mic-hint">
          {recording
            ? c.recordingHint
            : processing
              ? c.recognising
              : waiting
                ? c.tapMic
                : c.recordLabel}
        </Text>
        {waiting ? (
          <Pressable
            onPress={onTapRec}
            accessibilityRole="button"
            testID="speaking-start-answer"
            className="min-w-[200px] items-center rounded-full bg-accent px-6 py-3.5 active:opacity-80"
          >
            <Text className="font-ui-bold text-bg">{c.startAnswer}</Text>
          </Pressable>
        ) : null}
        {recording ? (
          <Pressable
            onPress={onStopEarly}
            accessibilityRole="button"
            testID="speaking-finish"
            className="min-w-[160px] items-center rounded-full bg-accent px-6 py-3 active:opacity-80"
          >
            <Text className="font-ui-bold text-bg">{c.done}</Text>
          </Pressable>
        ) : null}
      </View>
    </>
  );
}

/** The speaking part instruction + item count for the instruction screen's facts (T73). */
export function speakingFacts(
  subtest: ExamSubtest,
  level: TorflLevel = 'A1',
  lang: Lang = 'ru',
): string[] {
  const c = instructionCopy(lang);
  const out: string[] = [];
  for (const part of subtest.parts) {
    const first = part.items[0];
    const task = first ? speakingTaskOf(first) : null;
    if (task === null) continue;
    const sec = part.timeSec ?? 0;
    const min = Math.round(sec / 60);
    if (task === 3) {
      const m = first as SpeakingMonologueItem;
      out.push(
        task3Fact(
          part.items.filter((i) => i.kind === 'speaking-monologue').length,
          monologueWindows(level, m).prepSec,
          monologueWindows(level, m).answerSec,
          lang,
        ),
      );
    } else {
      out.push(c.taskFact(task, part.items.length, min));
    }
  }
  return out;
}

export function logSpeakingLookup(level: TorflLevel = 'A1'): void {
  trackTorfl('exam_lookup_used', { subtestKind: 'speaking', level });
}
