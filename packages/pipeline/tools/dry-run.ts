/**
 * T80 dry run: audit (+ restamp) every published pack with timestamps.
 * Usage: tsx tools/dry-run.ts <content-dir> <out-dir> [--align-dir DIR] [--packs a,b]
 * Without --align-dir uses pythonAligner (cached). With it, reads precomputed
 * `<pack>__<track>.ctc.json` files (forced_align.py --jobs output).
 * Writes <out>/<pack>.pack.json (restamped), <out>/audit-before.json,
 * <out>/audit-after.json. Never writes to the content dir.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { safeParsePack } from '@sumrak/schema';
import {
  analyseTrack,
  auditTrack,
  assertOnlyTimestampsChanged,
  pythonAligner,
  refineWords,
  restampTrack,
  type AlignedWord,
  type Aligner,
} from '../src/stamp-audit.ts';

const [content, out, ...rest] = process.argv.slice(2);
const opt = (k: string) => (rest.includes(k) ? rest[rest.indexOf(k) + 1] : undefined);
const alignDir = opt('--align-dir');
const only = opt('--packs')?.split(',');
mkdirSync(out!, { recursive: true });

const before: unknown[] = [];
const after: unknown[] = [];
for (const id of readdirSync(join(content!, 'packs')).sort()) {
  if (only && !only.includes(id)) continue;
  const dir = join(content!, 'packs', id);
  const raw = JSON.parse(readFileSync(join(dir, 'pack.json'), 'utf8'));
  const parsed = safeParsePack(raw);
  if (!parsed.success) continue;
  const pack = parsed.data;
  if (!pack.stories.some((s) => s.audio.some((a) => a.timestamps.length > 0))) continue;
  const next = structuredClone(pack);
  for (let si = 0; si < pack.stories.length; si++) {
    const story = pack.stories[si]!;
    for (let ti = 0; ti < story.audio.length; ti++) {
      const track = story.audio[ti]!;
      if (track.timestamps.length === 0) continue;
      let aligner: Aligner;
      if (alignDir) {
        const f = join(alignDir, `${id}__${track.id}.ctc.json`);
        if (!existsSync(f)) continue;
        const words = (JSON.parse(readFileSync(f, 'utf8')) as { words: AlignedWord[] }).words;
        aligner = () => words;
      } else aligner = pythonAligner({ device: 'mps' });
      const w = analyseTrack(dir, story.id, track, story.sentences, aligner);
      before.push({ pack: id, ...auditTrack(track, story.sentences, w.refined, w.db) });
      const stamps = restampTrack(story.sentences, w.refined);
      next.stories[si]!.audio[ti]!.timestamps = stamps;
      after.push({
        pack: id,
        ...auditTrack({ ...track, timestamps: stamps }, story.sentences, w.refined, w.db),
      });
    }
  }
  assertOnlyTimestampsChanged(pack, next);
  writeFileSync(join(out!, `${id}.pack.json`), `${JSON.stringify(next, null, 2)}\n`);
  console.log(id, 'restamped');
}
writeFileSync(join(out!, 'audit-before.json'), JSON.stringify(before, null, 1));
writeFileSync(join(out!, 'audit-after.json'), JSON.stringify(after, null, 1));
void refineWords;
