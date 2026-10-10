import { create } from 'zustand';

import { repos } from '@/db';
import { configureQueuePrefs } from '@/db/repositories/reviews';
import { SETTING_KEYS } from '@/db/repositories/settings';
import {
  clampNewPerDay,
  DEFAULT_QUEUE_PREFS,
  parseQueuePrefs,
  type QueuePrefs,
} from '@/features/review/due-core';
import { track } from '@/services/analytics';

/**
 * Queue prefs (T82): the daily new-word budget and sibling bury. Hydrated by
 * DbProvider before any queue is built; setters write through to the settings
 * table fire-and-forget and reconfigure the live repo prefs.
 */
interface QueuePrefsState {
  prefs: QueuePrefs;
  setNewPerDay: (value: number) => void;
  setBuryRelated: (value: boolean) => void;
}

function persist(prefs: QueuePrefs) {
  configureQueuePrefs(prefs);
  void repos.settings.set(SETTING_KEYS.queuePrefs, prefs);
}

export const useQueuePrefs = create<QueuePrefsState>((set, get) => ({
  prefs: DEFAULT_QUEUE_PREFS,

  setNewPerDay: (raw) => {
    const from = get().prefs.newPerDay;
    const to = clampNewPerDay(raw);
    if (to === from) return;
    const prefs = { ...get().prefs, newPerDay: to };
    set({ prefs });
    persist(prefs);
    track('new_budget_changed', { from, to });
  },

  setBuryRelated: (value) => {
    if (value === get().prefs.buryRelated) return;
    const prefs = { ...get().prefs, buryRelated: value };
    set({ prefs });
    persist(prefs);
    track('sibling_bury_changed', { on: value ? 1 : 0 });
  },
}));

export async function hydrateQueuePrefsFromDb(): Promise<void> {
  const prefs = parseQueuePrefs(await repos.settings.get<unknown>(SETTING_KEYS.queuePrefs));
  useQueuePrefs.setState({ prefs });
  configureQueuePrefs(prefs);
}
