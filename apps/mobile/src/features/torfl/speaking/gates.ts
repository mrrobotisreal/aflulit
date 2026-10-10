import type { HubGates } from '@/features/scenario/hub-gates';

import { instructionCopy, type Lang } from '../copy';

/**
 * The speaking subtest's start gate (T73, TORFL §12): the M17 hub gates
 * (`useHubGates`) decide — no ASR model or a denied mic blocks the subtest
 * with the reason; an undetermined mic is NOT a block (the system dialog
 * comes up on the instruction screen). Pure over the gate shape.
 */
export function speakingGateMessage(
  gates: Pick<HubGates, 'gate' | 'mic'>,
  lang: Lang = 'ru',
): string | null {
  const c = instructionCopy(lang);
  if (gates.gate === 'asr-missing') {
    return c.gateAsr;
  }
  if (gates.gate === 'mic-denied' || gates.mic === 'denied') {
    return c.gateMic;
  }
  return null;
}
