import { File, Paths } from 'expo-file-system';

/**
 * DEV-only WAV injection for the TORFL exam recorder (T77, CT035's proposed
 * `?devWav=`). In a `__DEV__` build, when `files/dev-exam.wav` exists (pushed
 * with `adb push` + `run-as cp`), the exam recorder does NOT open the mic: it
 * runs a JS clock as the "recording" and, on stop, hands that WAV to the normal
 * transcribe / stash / grade path. That lets an agent sit tasks 1-3 silently on
 * the S25 and prove, with a WAV that has 8 s of mid-answer silence, that a
 * pause never stops a recording. Release builds never read it.
 */
export function devInjectedWav(): { uri: string; durationMs: number } | null {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return null;
  try {
    const f = new File(Paths.document, 'dev-exam.wav');
    if (!f.exists) return null;
    // 16 kHz mono 16-bit PCM + a 44-byte header: 32 000 bytes per second.
    const durationMs = Math.round(((f.size ?? 0) - 44) / 32);
    return durationMs > 0 ? { uri: f.uri, durationMs } : null;
  } catch {
    return null;
  }
}

/** The stash moves its source, so every injected "recording" works on a fresh cache copy. */
export function copyDevWav(uri: string): string {
  const dest = new File(Paths.cache, 'exam-dev-copy.wav');
  if (dest.exists) dest.delete();
  new File(uri).copy(dest);
  return dest.uri;
}
