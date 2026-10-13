import * as React from 'react';
import { create } from 'zustand';

import { trackTorfl } from '@/services/analytics';

import type { TorflLevel } from './level-profile';
import { getTorflPrefs, setTorflPrefs } from './settings';
import type { InstructionLang } from './settings-core';

/**
 * The shared instruction-language state (T77): one zustand store hydrated from
 * `torfl.prefs.instructionLang`, so every TORFL screen flips together and the
 * choice survives a restart. Default `ru` (the real test).
 */
interface InstructionLangState {
  lang: InstructionLang;
  loaded: boolean;
  load: () => Promise<void>;
  set: (lang: InstructionLang) => void;
}

export const useInstructionLangStore = create<InstructionLangState>((set, get) => ({
  lang: 'ru',
  loaded: false,
  load: async () => {
    if (get().loaded) return;
    set({ loaded: true });
    try {
      set({ lang: (await getTorflPrefs()).instructionLang });
    } catch {
      /* keep the default */
    }
  },
  set: (lang) => {
    set({ lang, loaded: true });
    void setTorflPrefs({ instructionLang: lang }).catch(() => undefined);
  },
}));

/** The current instruction language (hydrates the pref once). */
export function useInstructionLang(): InstructionLang {
  const lang = useInstructionLangStore((s) => s.lang);
  React.useEffect(() => {
    void useInstructionLangStore.getState().load();
  }, []);
  return lang;
}

export type InstructionScreen =
  | 'instruction'
  | 'speaking'
  | 'writing'
  | 'tickets'
  | 'practice-speaking'
  | 'practice-writing'
  | 'debrief';

/** Flip RU ⇄ EN, persist, and log `torfl_instruction_lang_toggled {to, screen, level}`. */
export function toggleInstructionLang(screen: InstructionScreen, level: TorflLevel): void {
  const to: InstructionLang = useInstructionLangStore.getState().lang === 'ru' ? 'en' : 'ru';
  useInstructionLangStore.getState().set(to);
  trackTorfl('torfl_instruction_lang_toggled', { to, screen, level });
}
