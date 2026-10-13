import type { InstructionLang } from './settings-core';

/**
 * The «ТРКИ» INSTRUCTION copy table (T77, Mitch 2026-10-10): every string that
 * tells the candidate what to DO — buttons, status lines, task cards' chrome,
 * alerts, timing copy, «Билеты», practice and debrief labels — lives here as a
 * `{ ru, en }` pair, and ONE toggle («RU | EN», pref `instructionLang`) flips a
 * whole screen. Default `ru` = the real test.
 *
 * What is NOT here and must never be translated on screen: examiner questions,
 * situations, topic titles / questions, reading passages, listening scripts
 * (that is CONTENT — translating it would make practice pointless). Pack
 * instructions already carry `instructions.en`; the screens pick by language.
 *
 * `__tests__/instruction-copy.test.ts` scans the listed screens so no Russian
 * literal appears outside this file (and `speaking/timing-copy.ts`).
 */

export type Lang = InstructionLang;

function defineCopy<T extends Record<string, unknown>>(table: {
  [K in keyof T]: { ru: T[K]; en: T[K] };
}): (lang: Lang) => T {
  const cache = new Map<Lang, T>();
  return (lang) => {
    const hit = cache.get(lang);
    if (hit) return hit;
    const out = {} as T;
    for (const key of Object.keys(table) as (keyof T)[]) out[key] = table[key][lang];
    cache.set(lang, out);
    return out;
  };
}

/** Plain russian/english plural helper for the few counted nouns. */
function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** «5 мин» / «1 ч 30 мин» vs «5 min» / «1 h 30 min». */
export function fmtMinutes(lang: Lang, min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const [hu, mu] = lang === 'ru' ? ['ч', 'мин'] : ['h', 'min'];
  if (h === 0) return `${m} ${mu}`;
  if (m === 0) return `${h} ${hu}`;
  return `${h} ${hu} ${m} ${mu}`;
}

/** The locale for numbers (decimal comma in RU). */
export function numLocale(lang: Lang): string {
  return lang === 'ru' ? 'ru-RU' : 'en-US';
}

export const instructionCopy = defineCopy<{
  back: string;
  leave: string;
  quitExam: string;
  cancelBack: string;
  skipArrow: string;
  skipTask: string;
  skipTaskTitle: string;
  skipTaskBody: string;
  skipMonologueTitle: string;
  skipMonologueBody: string;
  returnBtn: string;
  // instruction screen
  beginSubtest: string;
  skipSubtest: string;
  timeFact: (time: string) => string;
  timeFactOverride: (sec: number, time: string) => string;
  itemsFact: (n: number) => string;
  dictOn: string;
  dictOff: string;
  listeningFact: (plays: number) => string;
  speakingFact: string;
  micFact: string;
  noCheckFact: string;
  taskFact: (task: number, count: number, min: number) => string;
  // speaking runner
  speaking: string;
  taskOf: (n: number, total: number) => string;
  chooseTopic: string;
  timeLeftA11y: (clock: string) => string;
  examinerSpeaking: string;
  listenExaminer: string;
  readyHeading: string;
  recordingHeading: string;
  savingHeading: string;
  answerHeading: string;
  replyCaption: string;
  situationCaption: string;
  synthetic: string;
  partClock: string;
  tapMic: string;
  tapMicHint: string;
  recordingHint: string;
  recordingCap: (sec: number) => string;
  secondsLeft: (sec: number) => string;
  done: string;
  recognising: string;
  topicStats: (q: number, min: number, max: number) => string;
  preparation: string;
  notesNotGraded: string;
  notes: string;
  yourNotes: string;
  notesPlaceholder: string;
  dictionary: string;
  prepDone: string;
  prepConfirmTitle: string;
  prepConfirmBody: (answerLine: string) => string;
  morePrep: string;
  ready: string;
  startAnswer: string;
  startAnswerHint: (answerLine: string) => string;
  answer: string;
  warn10: string;
  recordLabel: string;
  // practice (task 1/2)
  practiceTitle: string;
  untimed: string;
  examinerQuestion: string;
  situation: string;
  listenAnyTime: string;
  playExaminerA11y: string;
  practiceHintReady: string;
  practiceHintRecording: (cap: string) => string;
  again: string;
  practiceSaveFailTitle: string;
  practiceSaveFailBody: string;
  taskNotFound: string;
  // tickets
  tickets: string;
  ticketsSub: (n: number) => string;
  drawTicket: string;
  ticketsEmpty: string;
  ticketRandom: string;
  ticket: string;
  startPrep: (min: number) => string;
  returnToDeck: string;
  sentencesNotes: (min: number, max: number) => string;
  anotherTicket: string;
  // debrief
  debriefTitle: string;
  provisional: string;
  aiGraded: string;
  selfChecked: string;
  speakingNotFound: string;
  nothingToGrade: string;
  downloading: string;
  recordsOnDevice: (kb: string) => string;
  inBackup: string;
  backupWaiting: string;
  backupFailed: string;
  pinned: string;
  recordsInBackup: string;
  recordsDeleted: string;
  noRecords: string;
  downloadA11y: string;
  downloadBtn: string;
  examiner: string;
  yourAnswer: (dur: string) => string;
  noRecording: string;
  nothingRecognised: string;
  modelAnswer: string;
  modelMonologue: string;
  aiGrading: string;
  waitingNet: string;
  aiFailed: (code: string | null) => string;
  offlineOnly: string;
  retryGrade: string;
  practiseBtn: string;
  ticketsBtn: string;
  topicNotChosen: string;
  noAnswer: string;
  verdictTask3: (
    covered: number,
    total: number,
    sentences: number,
    min: number,
    words: number,
    wpm: number,
  ) => string;
  verdictMatched: string;
  verdictNear: string;
  verdictSilent: string;
  verdictMiss: string;
  verdictFull: string;
  verdictShort: (have: number, need: number) => string;
  viaWhisper: string;
  // writing
  writing: string;
  writingTask: (n: number) => string;
  practiceSuffix: string;
  sentencesShort: (n: number) => string;
  empty: string;
  submitWritingMulti: string;
  submitWriting: string;
  bothEmpty: string;
  letterEmpty: string;
  afterSubmit: (detail: string) => string;
  submit: string;
  cancelReturn: string;
  minSentences: (n: number) => string;
  questionsNeeded: (min: number, max: number | null, singular: boolean) => string;
  dictAllowedSuffix: string;
  messageToFriend: string;
  keyboardHint: string;
  wPracticeTitle: string;
  wPracticeSubmitTitle: string;
  wPracticeSubmitBody: string;
  wSaveFailTitle: string;
  wSaveFailBody: string;
  wAiGrading: string;
  wAiFailed: string;
  wProvisional: string;
  wPoints: (
    covered: number,
    total: number,
    sentences: number,
    questions: number,
    greeting: boolean,
    signOff: boolean,
  ) => string;
  selfCheck: string;
  modelLetter: string;
  openInReader: string;
  // gates + run
  gateAsr: string;
  gateMic: string;
  openSpeechSettings: string;
  audioMissing: string;
  checkingAudio: string;
  quitTitle: string;
  quitBody: string;
  quitContinue: string;
  quitSave: string;
  quitAbandon: string;
  openFail: string;
  countingResult: string;
  toggleA11y: string;
}>({
  back: { ru: 'Назад', en: 'Back' },
  leave: { ru: 'Выйти', en: 'Exit' },
  quitExam: { ru: 'Выйти из экзамена', en: 'Leave the exam' },
  cancelBack: { ru: 'Вернуться', en: 'Go back' },
  skipArrow: { ru: 'Пропустить →', en: 'Skip →' },
  skipTask: { ru: 'Пропустить', en: 'Skip' },
  skipTaskTitle: { ru: 'Пропустить задание?', en: 'Skip this task?' },
  skipTaskBody: {
    ru: 'Ответа не будет — задание засчитается как пустое.',
    en: 'No answer will be recorded — the task counts as empty.',
  },
  skipMonologueTitle: { ru: 'Пропустить монолог?', en: 'Skip the monologue?' },
  skipMonologueBody: {
    ru: 'Задание 3 засчитается как пустое.',
    en: 'Task 3 will count as empty.',
  },
  returnBtn: { ru: 'Вернуться', en: 'Go back' },

  beginSubtest: { ru: 'Начать субтест', en: 'Start the subtest' },
  skipSubtest: { ru: 'Пропустить этот субтест', en: 'Skip this subtest' },
  timeFact: { ru: (t: string) => `Время: ${t}`, en: (t: string) => `Time: ${t}` },
  timeFactOverride: {
    ru: (s: number, t: string) => `ТЕСТ: ${s} с (вместо ${t})`,
    en: (s: number, t: string) => `TEST: ${s} s (instead of ${t})`,
  },
  itemsFact: { ru: (n: number) => `Заданий: ${n}`, en: (n: number) => `Items: ${n}` },
  dictOn: { ru: 'Словарь можно (нажми на слово)', en: 'Dictionary allowed (tap a word)' },
  dictOff: { ru: 'Без словаря', en: 'No dictionary' },
  listeningFact: {
    ru: (p: number) => `Каждый текст звучит ${p} раза. Назад нельзя.`,
    en: (p: number) => `Each text plays ${p} times. You cannot go back.`,
  },
  speakingFact: {
    ru: 'Каждый ответ записывается; подсказок и повторов нет.',
    en: 'Every answer is recorded; no hints, no repeats.',
  },
  micFact: {
    ru: 'Микрофон включаешь ты: нажми, чтобы начать, и «Готово», чтобы закончить. Паузы запись не останавливают.',
    en: 'You open the mic yourself: tap to start, tap Done to finish. Pauses never stop the recording.',
  },
  noCheckFact: {
    ru: 'Проверки ответов не будет — результат после сдачи.',
    en: 'No answer checking — you get the result after you finish.',
  },
  taskFact: {
    ru: (task: number, count: number, min: number) =>
      `Задание ${task}: ${count} ${task === 1 ? 'вопрос(ов) экзаменатора' : 'ситуаций'}, ${min} мин на часть.`,
    en: (task: number, count: number, min: number) =>
      `Task ${task}: ${count} ${task === 1 ? 'examiner questions' : 'situations'}, ${min} min for the part.`,
  },

  speaking: { ru: 'Говорение', en: 'Speaking' },
  taskOf: {
    ru: (n: number, t: number) => `Задание ${n} из ${t}`,
    en: (n: number, t: number) => `Task ${n} of ${t}`,
  },
  chooseTopic: { ru: 'Выбор темы', en: 'Choose a topic' },
  timeLeftA11y: {
    ru: (c: string) => `Осталось ${c}`,
    en: (c: string) => `Time left ${c}`,
  },
  examinerSpeaking: { ru: 'Экзаменатор говорит…', en: 'The examiner is speaking…' },
  listenExaminer: { ru: 'Слушай экзаменатора', en: 'Listen to the examiner' },
  readyHeading: { ru: 'Нажми и говори', en: 'Tap the mic and answer' },
  recordingHeading: { ru: 'Запись… говори', en: 'Recording… speak' },
  savingHeading: { ru: 'Записываю ответ…', en: 'Saving your answer…' },
  answerHeading: { ru: 'Ответ', en: 'Answer' },
  replyCaption: {
    ru: 'Вопрос звучит один раз. Ответь полным предложением.',
    en: 'The question plays once. Answer in a full sentence.',
  },
  situationCaption: {
    ru: 'Прочитай ситуацию и начни диалог первым.',
    en: 'Read the situation and start the dialogue.',
  },
  synthetic: { ru: ' · синтез', en: ' · synthetic voice' },
  partClock: { ru: 'Время на эту часть', en: 'Time left for this part' },
  tapMic: { ru: 'Нажми на микрофон', en: 'Tap the mic' },
  tapMicHint: {
    ru: 'Думай сколько нужно. Микрофон включится, когда нажмёшь.',
    en: 'Take your time. The mic opens only when you tap it.',
  },
  recordingHint: {
    ru: 'Паузы можно. Закончишь — нажми «Готово».',
    en: 'Pauses are fine. Tap Done when you finish.',
  },
  recordingCap: {
    ru: (s: number) => `Не больше ${s} с`,
    en: (s: number) => `${s} s at most`,
  },
  secondsLeft: { ru: (s: number) => `Осталось ${s} с`, en: (s: number) => `${s} s left` },
  done: { ru: 'Готово', en: 'Done' },
  recognising: { ru: 'Распознаю…', en: 'Transcribing…' },
  topicStats: {
    ru: (q: number, a: number, b: number) => `${q} вопрос(ов) · ${a}–${b} предложений`,
    en: (q: number, a: number, b: number) => `${q} questions · ${a}–${b} sentences`,
  },
  preparation: { ru: 'Подготовка', en: 'Preparation' },
  notesNotGraded: { ru: 'Заметки (не оцениваются)', en: 'Notes (not graded)' },
  notes: { ru: 'Заметки', en: 'Notes' },
  yourNotes: { ru: 'Твои заметки', en: 'Your notes' },
  notesPlaceholder: { ru: 'Ключевые слова, план ответа…', en: 'Key words, a plan…' },
  dictionary: { ru: 'Словарь', en: 'Dictionary' },
  prepDone: { ru: 'Готов — к ответу', en: 'Done preparing' },
  prepConfirmTitle: { ru: 'Закончить подготовку?', en: 'Finish preparing?' },
  prepConfirmBody: {
    ru: (a: string) => `Дальше нажмёшь «Начать ответ». На ответ — ${a}.`,
    en: (a: string) => `Next you tap Start answer. You get ${a} to answer.`,
  },
  morePrep: { ru: 'Ещё подготовлюсь', en: 'A bit more prep' },
  ready: { ru: 'Готов', en: 'Ready' },
  startAnswer: { ru: 'Начать ответ', en: 'Start answer' },
  startAnswerHint: {
    ru: (a: string) => `Подготовка закончилась. Нажми, когда будешь готов — запись пойдёт ${a}.`,
    en: (a: string) => `Preparation is over. Tap when you are ready — the recording runs ${a}.`,
  },
  answer: { ru: 'Ответ', en: 'Answer' },
  warn10: { ru: 'Осталось 10 секунд — заканчивай мысль.', en: '10 seconds left — wrap up.' },
  recordLabel: { ru: 'Запись', en: 'Recording' },

  practiceTitle: { ru: 'Говорение · тренировка', en: 'Speaking · practice' },
  untimed: { ru: 'без таймера', en: 'untimed' },
  examinerQuestion: { ru: 'Вопрос экзаменатора', en: "Examiner's question" },
  situation: { ru: 'Ситуация', en: 'Situation' },
  listenAnyTime: { ru: 'Можно слушать сколько угодно', en: 'Listen as often as you like' },
  playExaminerA11y: { ru: 'Прослушать вопрос', en: 'Play the examiner line' },
  practiceHintReady: { ru: 'Нажми и отвечай', en: 'Tap and answer' },
  practiceHintRecording: {
    ru: (cap: string) => `Говори · «Готово», когда закончишь · до ${cap}`,
    en: (cap: string) => `Speak · tap Done when finished · up to ${cap}`,
  },
  again: { ru: 'Ещё раз', en: 'Again' },
  practiceSaveFailTitle: { ru: 'Не удалось сохранить ответ', en: 'Could not save the answer' },
  practiceSaveFailBody: { ru: 'Попробуй ещё раз.', en: 'Please try again.' },
  taskNotFound: { ru: 'Задание не найдено.', en: 'Task not found.' },

  tickets: { ru: 'Билеты', en: 'Tickets' },
  ticketsSub: {
    ru: (n: number) => `Задание 3 · монолог · ${n} ${n === 1 ? 'тема' : 'тем'}`,
    en: (n: number) => `Task 3 · monologue · ${n} ${plural(n, 'topic', 'topics')}`,
  },
  drawTicket: { ru: 'Тянуть билет', en: 'Draw a ticket' },
  ticketsEmpty: { ru: 'Темы появятся вместе с экзаменами', en: 'Topics arrive with the exams' },
  ticketRandom: { ru: 'Случайная тема монолога', en: 'A random monologue topic' },
  ticket: { ru: 'Билет', en: 'Ticket' },
  startPrep: {
    ru: (m: number) => `Начать подготовку · ${m} мин`,
    en: (m: number) => `Start preparing · ${m} min`,
  },
  returnToDeck: { ru: 'Вернуть в колоду', en: 'Back to the deck' },
  sentencesNotes: {
    ru: (a: number, b: number) => `${a}–${b} предложений. Заметки не оцениваются.`,
    en: (a: number, b: number) => `${a}–${b} sentences. Notes are not graded.`,
  },
  anotherTicket: { ru: 'Ещё билет', en: 'Another ticket' },

  debriefTitle: { ru: 'Говорение · разбор', en: 'Speaking · review' },
  provisional: { ru: ' · предварительно', en: ' · provisional' },
  aiGraded: { ru: ' · оценка ИИ', en: ' · AI graded' },
  selfChecked: { ru: ' · самопроверка', en: ' · self-checked' },
  speakingNotFound: { ru: 'Говорение не найдено.', en: 'Speaking attempt not found.' },
  nothingToGrade: {
    ru: 'Нечего оценивать — ответ пустой.',
    en: 'Nothing to grade — the answer is empty.',
  },
  downloading: { ru: 'Скачиваю записи…', en: 'Downloading recordings…' },
  recordsOnDevice: {
    ru: (kb: string) => `Записи на устройстве · ${kb}`,
    en: (kb: string) => `Recordings on this device · ${kb}`,
  },
  inBackup: { ru: ' · в резервной копии', en: ' · backed up' },
  backupWaiting: { ru: ' · копия ждёт связи', en: ' · backup waiting for a connection' },
  backupFailed: { ru: ' · копия не загрузилась', en: ' · backup failed' },
  pinned: { ru: ' · закреплена', en: ' · pinned' },
  recordsInBackup: { ru: 'Записи в резервной копии', en: 'Recordings are in the backup' },
  recordsDeleted: {
    ru: 'Записи удалены (не было резервной копии)',
    en: 'Recordings deleted (there was no backup)',
  },
  noRecords: { ru: 'Записей нет', en: 'No recordings' },
  downloadA11y: { ru: 'Скачать запись', en: 'Download the recording' },
  downloadBtn: { ru: 'Скачать запись', en: 'Download' },
  examiner: { ru: 'Экзаменатор', en: 'Examiner' },
  yourAnswer: { ru: (d: string) => `Твой ответ · ${d}`, en: (d: string) => `Your answer · ${d}` },
  noRecording: { ru: 'Нет записи', en: 'No recording' },
  nothingRecognised: { ru: 'Ничего не распознано.', en: 'Nothing was recognised.' },
  modelAnswer: { ru: 'Образец ответа', en: 'Model answer' },
  modelMonologue: { ru: 'Образец монолога', en: 'Model monologue' },
  aiGrading: { ru: 'ИИ оценивает…', en: 'The AI is grading…' },
  waitingNet: {
    ru: 'Ждёт связи: ИИ оценит, когда появится интернет.',
    en: 'Waiting for a connection — the AI grades when you are online.',
  },
  aiFailed: {
    ru: (code: string | null) => `Оценка ИИ не удалась${code ? ` (${code})` : ''}.`,
    en: (code: string | null) => `AI grading failed${code ? ` (${code})` : ''}.`,
  },
  offlineOnly: {
    ru: 'Пока только офлайн-критерии; ИИ оценит грамматику.',
    en: 'Offline criteria only for now; the AI will grade grammar.',
  },
  retryGrade: { ru: 'Повторить оценку', en: 'Retry grading' },
  practiseBtn: { ru: 'Практиковать', en: 'Practise' },
  ticketsBtn: { ru: 'Билеты', en: 'Tickets' },
  topicNotChosen: { ru: 'Тема не выбрана', en: 'Topic not chosen' },
  noAnswer: { ru: 'Без ответа', en: 'No answer' },
  verdictTask3: {
    ru: (c: number, t: number, s: number, m: number, w: number, wpm: number) =>
      `Вопросов раскрыто ${c} из ${t} · предложений ≈ ${s} (нужно ${m}) · ${w} слов${wpm > 0 ? ` · ${Math.round(wpm)} сл/мин` : ''}`,
    en: (c: number, t: number, s: number, m: number, w: number, wpm: number) =>
      `Questions covered ${c} of ${t} · sentences ≈ ${s} (need ${m}) · ${w} words${wpm > 0 ? ` · ${Math.round(wpm)} wpm` : ''}`,
  },
  verdictMatched: { ru: '✓ по заданию', en: '✓ on task' },
  verdictNear: { ru: '≈ почти', en: '≈ almost' },
  verdictSilent: { ru: 'тишина', en: 'silence' },
  verdictMiss: { ru: '✗ мимо', en: '✗ off task' },
  verdictFull: { ru: 'полный ответ', en: 'full answer' },
  verdictShort: {
    ru: (h: number, n: number) => `короткий ответ (${h} из ${n} слов)`,
    en: (h: number, n: number) => `short answer (${h} of ${n} words)`,
  },
  viaWhisper: { ru: ' · по Whisper', en: ' · via Whisper' },

  writing: { ru: 'Письмо', en: 'Writing' },
  writingTask: { ru: (n: number) => `Задание ${n}`, en: (n: number) => `Task ${n}` },
  practiceSuffix: { ru: ' · тренировка', en: ' · practice' },
  sentencesShort: { ru: (n: number) => `${n} предл.`, en: (n: number) => `${n} sent.` },
  empty: { ru: 'пусто', en: 'empty' },
  submitWritingMulti: { ru: 'Сдать письменную работу?', en: 'Submit your writing?' },
  submitWriting: { ru: 'Сдать письмо?', en: 'Submit the letter?' },
  bothEmpty: {
    ru: 'Оба задания пусты — субтест будет оценён в 0 %.',
    en: 'Both tasks are empty — the subtest scores 0 %.',
  },
  letterEmpty: {
    ru: 'Письмо пустое — субтест будет оценён в 0 %.',
    en: 'The letter is empty — the subtest scores 0 %.',
  },
  afterSubmit: {
    ru: (d: string) =>
      `После сдачи текст изменить нельзя. Оценка появится сразу (предварительно), ИИ оценит позже.${d}`,
    en: (d: string) =>
      `You cannot edit after submitting. A provisional score appears at once; the AI grades later.${d}`,
  },
  submit: { ru: 'Сдать', en: 'Submit' },
  cancelReturn: { ru: 'Вернуться', en: 'Go back' },
  minSentences: {
    ru: (n: number) => `Не менее ${n} предложений`,
    en: (n: number) => `At least ${n} sentences`,
  },
  questionsNeeded: {
    ru: (min: number, max: number | null, singular: boolean) =>
      `, ${min}${max ? `–${max}` : ''} ${singular ? 'вопрос' : 'вопроса(ов)'}`,
    en: (min: number, max: number | null, singular: boolean) =>
      `, ${min}${max ? `–${max}` : ''} ${singular ? 'question' : 'questions'}`,
  },
  dictAllowedSuffix: { ru: ' Можно пользоваться словарём.', en: ' You may use the dictionary.' },
  messageToFriend: { ru: 'Сообщение другу', en: 'A message to a friend' },
  keyboardHint: {
    ru: 'Включи русскую клавиатуру. Счётчики считают предложения по точкам и вопросительным знакам.',
    en: 'Switch to the Russian keyboard. The counters count sentences by full stops and question marks.',
  },
  wPracticeTitle: { ru: 'Письмо · тренировка', en: 'Writing · practice' },
  wPracticeSubmitTitle: { ru: 'Сдать письмо?', en: 'Submit the letter?' },
  wPracticeSubmitBody: {
    ru: 'Оценка появится сразу; ИИ оценит, когда будет связь.',
    en: 'You get a score at once; the AI grades when you are online.',
  },
  wSaveFailTitle: { ru: 'Не удалось сохранить письмо', en: 'Could not save the letter' },
  wSaveFailBody: { ru: 'Попробуй ещё раз.', en: 'Please try again.' },
  wAiGrading: { ru: 'ИИ оценивает письмо…', en: 'The AI is grading your letter…' },
  wAiFailed: {
    ru: 'Оценка ИИ не удалась — предварительная осталась.',
    en: 'AI grading failed — the provisional score stays.',
  },
  wProvisional: {
    ru: 'Пока только офлайн-критерии. ИИ оценит, когда будет связь и ключ.',
    en: 'Offline criteria only for now. The AI grades when you are online with a key.',
  },
  wPoints: {
    ru: (c: number, t: number, s: number, q: number, g: boolean, o: boolean) =>
      `Пункты: ${c} из ${t} · предложений ${s} · вопросов ${q}${g ? ' · приветствие ✓' : ' · без приветствия'}${o ? ' · прощание ✓' : ' · без прощания'}`,
    en: (c: number, t: number, s: number, q: number, g: boolean, o: boolean) =>
      `Points: ${c} of ${t} · sentences ${s} · questions ${q}${g ? ' · greeting ✓' : ' · no greeting'}${o ? ' · sign-off ✓' : ' · no sign-off'}`,
  },
  selfCheck: { ru: 'Самопроверка', en: 'Self-check' },
  modelLetter: { ru: 'Образец письма', en: 'Model letter' },
  openInReader: { ru: 'Открыть в читалке', en: 'Open in the reader' },

  gateAsr: {
    ru: 'Нет модели распознавания речи: без неё ответы не оцениваются. Установи «Russian speech recognition» в настройках и вернись — или пропусти субтест.',
    en: 'The speech-recognition model is missing, so answers cannot be graded. Install “Russian speech recognition” in Settings and come back — or skip the subtest.',
  },
  gateMic: {
    ru: 'Микрофон запрещён: разреши запись звука для Aflulit в настройках системы и вернись — или пропусти субтест.',
    en: 'The microphone is blocked: allow audio recording for Aflulit in system settings and come back — or skip the subtest.',
  },
  openSpeechSettings: { ru: 'Открыть настройки речи', en: 'Open speech settings' },
  audioMissing: {
    ru: 'Скачай аудио по Wi-Fi: без файла экзамен не звучит. Подключись к Wi-Fi, синхронизируй пакет и вернись.',
    en: 'Download the audio on Wi-Fi: without the files the exam stays silent. Connect to Wi-Fi, sync the pack and come back.',
  },
  checkingAudio: { ru: 'Проверяем аудио…', en: 'Checking the audio…' },
  quitTitle: { ru: 'Выйти из экзамена?', en: 'Leave the exam?' },
  quitBody: {
    ru: 'Прогресс сохранится, таймер продолжит идти по часам.',
    en: 'Your progress is saved; the timer keeps running on the clock.',
  },
  quitContinue: { ru: 'Продолжить', en: 'Continue' },
  quitSave: { ru: 'Сохранить и выйти', en: 'Save and leave' },
  quitAbandon: { ru: 'Завершить попытку', en: 'End the attempt' },
  openFail: { ru: 'Не удалось открыть экзамен.', en: 'Could not open the exam.' },
  countingResult: { ru: 'Считаем результат…', en: 'Counting your result…' },
  toggleA11y: { ru: 'Язык инструкций', en: 'Instruction language' },
});

/** Non-switching Russian CONTENT hints (the answer itself must be Russian). */
export const RU_CONTENT = {
  letterPlaceholder: 'Привет, …',
} as const;
