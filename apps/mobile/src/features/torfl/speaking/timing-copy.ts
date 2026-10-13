import { minutesRu } from '../minutes-ru';
import type { InstructionLang } from '../settings-core';

/**
 * Every task-3 timing string, generated from the windows in play (T76, A2-9):
 * the exam speaking screen, the instruction facts, «Билеты» and the tickets
 * screen all read these, so a level's numbers live in ONE place (the item /
 * the level profile) and never in copy. T77: each takes a `lang` (default
 * 'ru' = the real test) — the English twin is the same sentence, plain words.
 */

/** «8 минут» / "8 minutes". */
export function minutesLang(sec: number, lang: InstructionLang = 'ru'): string {
  if (lang === 'ru') return minutesRu(sec);
  const n = Math.round(sec / 60);
  return `${n} ${n === 1 ? 'minute' : 'minutes'}`;
}

/** «8 минут на подготовку, затем 2 минуты на ответ». */
export function windowsLine(
  prepSec: number,
  answerSec: number,
  lang: InstructionLang = 'ru',
): string {
  return lang === 'ru'
    ? `${minutesRu(prepSec)} на подготовку, затем ${minutesRu(answerSec)} на ответ`
    : `${minutesLang(prepSec, 'en')} to prepare, then ${minutesLang(answerSec, 'en')} to answer`;
}

/** The choose-step lead: «Задание 3. Выбери одну из двух тем. После выбора — …». Only for a group of two. */
export function chooseLine(
  topicCount: number,
  prepSec: number,
  answerSec: number,
  lang: InstructionLang = 'ru',
): string {
  if (lang === 'en') {
    const lead =
      topicCount === 2
        ? 'Pick one of the two topics. After you pick: '
        : 'Pick a topic. After you pick: ';
    return `Task 3. ${lead}${windowsLine(prepSec, answerSec, 'en')}.`;
  }
  const lead =
    topicCount === 2 ? 'Выбери одну из двух тем. После выбора — ' : 'Выбери тему. После выбора — ';
  return `Задание 3. ${lead}${windowsLine(prepSec, answerSec)}.`;
}

/** The instruction-screen fact: two topics → «одна тема из двух», one → «одна тема». */
export function task3Fact(
  topicCount: number,
  prepSec: number,
  answerSec: number,
  lang: InstructionLang = 'ru',
): string {
  if (lang === 'en') {
    const topics =
      topicCount === 2
        ? 'one topic out of two'
        : topicCount === 1
          ? 'one topic'
          : `one of ${topicCount} topics`;
    const mins = (s: number) => `${Math.round(s / 60)} min`;
    return `Task 3: ${topics}, ${mins(prepSec)} to prepare, ${mins(answerSec)} to answer.`;
  }
  const topics =
    topicCount === 2
      ? 'одна тема из двух'
      : topicCount === 1
        ? 'одна тема'
        : `одна из ${topicCount} тем`;
  const mins = (s: number) => `${Math.round(s / 60)} мин`;
  return `Задание 3: ${topics}, подготовка ${mins(prepSec)}, ответ ${mins(answerSec)}.`;
}

/** The recording-start confirm body (T77: the answer starts at HIS tap, so the line says what the window is). */
export function startAnswerLine(answerSec: number, lang: InstructionLang = 'ru'): string {
  return lang === 'ru'
    ? `Запись пойдёт сразу: ${minutesRu(answerSec)}, без остановки таймера.`
    : `Recording starts at once: ${minutesLang(answerSec, 'en')}, and the timer cannot be paused.`;
}

/** The answering caption: «Идёт запись — 5 минут». */
export function recordingLine(answerSec: number, lang: InstructionLang = 'ru'): string {
  return lang === 'ru'
    ? `Идёт запись — ${minutesRu(answerSec)}`
    : `Recording — ${minutesLang(answerSec, 'en')}`;
}

/** The prep-card hint: «Расскажи 12–15 предложений. …» */
export function sentencesLine(min: number, max: number, lang: InstructionLang = 'ru'): string {
  return lang === 'ru'
    ? `Расскажи ${min}–${max} предложений. Отвечать нужно без текста — заметки только для подготовки.`
    : `Say ${min}–${max} sentences. You answer without text — notes are for preparation only.`;
}

/** «5 минут» wording used inside the instruction copy ("5 minutes"). */
export function answerWindow(answerSec: number, lang: InstructionLang = 'ru'): string {
  return minutesLang(answerSec, lang);
}
