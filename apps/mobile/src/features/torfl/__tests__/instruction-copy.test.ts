import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { instructionCopy } from '../copy';
import {
  chooseLine,
  recordingLine,
  sentencesLine,
  startAnswerLine,
  task3Fact,
  windowsLine,
} from '../speaking/timing-copy';

const TORFL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The screens that carry the RU | EN toggle (T77). Russian literals live ONLY in copy.ts / timing-copy.ts. */
const SCREENS = [
  'exam-instruction-screen.tsx',
  'exam-run-screen.tsx',
  'exam-writing-screen.tsx',
  'speaking/exam-speaking-screen.tsx',
  'speaking/speaking-practice-screen.tsx',
  'speaking/tickets-screen.tsx',
  'speaking/speaking-debrief-screen.tsx',
  'writing/writing-editor.tsx',
  'writing/writing-practice-screen.tsx',
];

function code(file: string): string {
  const src = fs.readFileSync(path.join(TORFL, file), 'utf8');
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('instruction copy (T77)', () => {
  it.each(SCREENS)('%s has no Cyrillic literal outside the copy table', (file) => {
    const hits = code(file)
      .split('\n')
      .filter((l) => /[А-Яа-яЁё]/.test(l))
      .map((l) => l.trim());
    expect(hits).toEqual([]);
  });

  it('every ru/en pair is filled, and en differs from ru for plain strings', () => {
    const ru = instructionCopy('ru');
    const en = instructionCopy('en');
    expect(Object.keys(en).sort()).toEqual(Object.keys(ru).sort());
    for (const key of Object.keys(ru) as (keyof typeof ru)[]) {
      expect(typeof en[key]).toBe(typeof ru[key]);
      if (typeof ru[key] === 'string') {
        expect(en[key], key).not.toBe('');
        expect(/[А-Яа-яЁё]/.test(en[key] as string), `en.${key} must be English`).toBe(false);
      }
    }
  });

  it('the speaking-flow strings say what Mitch asked', () => {
    expect(instructionCopy('en').readyHeading).toBe('Tap the mic and answer');
    expect(instructionCopy('ru').readyHeading).toBe('Нажми и говори');
    expect(instructionCopy('en').done).toBe('Done');
    expect(instructionCopy('ru').done).toBe('Готово');
  });

  it('timing copy: RU stays the T76 text, EN is the same sentence in plain words', () => {
    expect(windowsLine(480, 120)).toBe('8 минут на подготовку, затем 2 минуты на ответ');
    expect(windowsLine(480, 120, 'en')).toBe('8 minutes to prepare, then 2 minutes to answer');
    expect(chooseLine(2, 480, 120, 'en')).toBe(
      'Task 3. Pick one of the two topics. After you pick: 8 minutes to prepare, then 2 minutes to answer.',
    );
    expect(task3Fact(1, 600, 300, 'en')).toBe(
      'Task 3: one topic, 10 min to prepare, 5 min to answer.',
    );
    expect(recordingLine(300, 'en')).toBe('Recording — 5 minutes');
    expect(startAnswerLine(120, 'en')).toContain('2 minutes');
    expect(sentencesLine(12, 15, 'en')).toContain('12–15 sentences');
  });
});
