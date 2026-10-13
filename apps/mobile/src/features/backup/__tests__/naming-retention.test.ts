import { describe, expect, it } from 'vitest';

import {
  backupFileName,
  MEDIA_FILE_RE,
  mediaFileName,
  parseBackupFileName,
  parseMediaFileName,
} from '../naming';
import { planRetention, RETENTION_DAILY_DAYS } from '../retention';

import { examBundleStem } from '@/features/torfl/media-state-core';

function nameFor(dateKey: string, time = '030000'): string {
  return `aflulit-backup-${dateKey.replaceAll('-', '')}-${time}Z.json`;
}

describe('backup naming', () => {
  it('formats in UTC and round-trips through the parser', () => {
    const at = new Date('2026-08-23T03:07:09Z');
    const name = backupFileName(at);
    expect(name).toBe('aflulit-backup-20260823-030709Z.json');
    const parsed = parseBackupFileName(name);
    expect(parsed).toEqual({
      name,
      dateKey: '2026-08-23',
      monthKey: '2026-08',
      timestamp: at.getTime(),
    });
  });

  it('rejects non-backup names and impossible calendar values', () => {
    expect(parseBackupFileName('manifest.json')).toBeNull();
    expect(parseBackupFileName('aflulit-backup-20260823-030709.json')).toBeNull(); // no Z
    expect(parseBackupFileName(nameFor('2026-13-01'))).toBeNull(); // month 13
    expect(parseBackupFileName(nameFor('2026-02-30'))).toBeNull(); // Feb 30
  });
});

describe('retention ring buffer (30 daily + one per older month)', () => {
  it('keeps everything when fewer than 30 distinct days exist', () => {
    const names = ['2026-08-01', '2026-08-02', '2026-08-03'].map((d) => nameFor(d));
    const plan = planRetention(names);
    expect(plan.prune).toEqual([]);
    expect(plan.keep).toEqual(names);
  });

  it('keeps the newest 30 dates and the latest per older month', () => {
    const names: string[] = [];
    // 40 consecutive days: 2026-07-20 .. 2026-08-28.
    for (let i = 0; i < 40; i++) {
      const d = new Date(Date.UTC(2026, 6, 20 + i));
      names.push(backupFileName(d));
    }
    const plan = planRetention(names);
    const keptDates = plan.keep.map((n) => parseBackupFileName(n)!.dateKey).sort();

    // Newest 30 dates: 2026-07-30 .. 2026-08-28 all kept.
    expect(keptDates.filter((d) => d >= '2026-07-30')).toHaveLength(RETENTION_DAILY_DAYS);
    // Older window 07-20..07-29 collapses to the latest of July in that range.
    const olderKept = keptDates.filter((d) => d < '2026-07-30');
    expect(olderKept).toEqual(['2026-07-29']);
    expect(plan.prune).toHaveLength(9);
    expect(plan.keep.length + plan.prune.length).toBe(names.length);
  });

  it('keeps one monthly per distinct older month', () => {
    const names = [
      // Old months, two snapshots each — the later of each survives.
      nameFor('2026-01-05', '020000'),
      nameFor('2026-01-20', '020000'),
      nameFor('2026-02-03', '020000'),
      nameFor('2026-02-27', '020000'),
      // Recent (well within 30 distinct dates).
      nameFor('2026-08-20'),
      nameFor('2026-08-21'),
      nameFor('2026-08-22'),
    ];
    // 5 distinct recent dates < 30 → the two old months are NOT beyond the
    // window yet... they ARE, because the window is the newest 30 *distinct
    // dates present*, which here covers all 7. Everything stays.
    expect(planRetention(names).prune).toEqual([]);

    // Now add 30 fresh dates so the old months fall outside the window.
    const fresh = Array.from({ length: 30 }, (_, i) =>
      backupFileName(new Date(Date.UTC(2026, 7, 1 + i, 3))),
    );
    const plan = planRetention([...names.slice(0, 4), ...fresh]);
    const olderKept = plan.keep.filter((n) => n < 'aflulit-backup-202608').sort();
    expect(olderKept).toEqual([nameFor('2026-01-20', '020000'), nameFor('2026-02-27', '020000')]);
    expect(plan.prune.sort()).toEqual([
      nameFor('2026-01-05', '020000'),
      nameFor('2026-02-03', '020000'),
    ]);
  });

  it('multiple backups on one recent day are all kept (day granularity)', () => {
    const names = [nameFor('2026-08-23', '010000'), nameFor('2026-08-23', '230000')];
    expect(planRetention(names).prune).toEqual([]);
  });

  it('never touches files it cannot parse, and never prunes the newest backup', () => {
    const stranger = 'README.md';
    const names = [
      stranger,
      ...Array.from({ length: 45 }, (_, i) => backupFileName(new Date(Date.UTC(2026, 3, 1 + i)))),
    ];
    const plan = planRetention(names);
    expect(plan.keep).toContain(stranger);
    const newest = names[names.length - 1]!;
    expect(plan.keep).toContain(newest);
  });

  it('is clock-independent: results derive from names alone', () => {
    // A "future-dated" file (device clock was wrong) is just the newest date;
    // nothing currently needed gets pruned because of it.
    const names = [
      nameFor('2030-01-01'), // wrong-clock artifact
      nameFor('2026-08-22'),
      nameFor('2026-08-23'),
    ];
    expect(planRetention(names).prune).toEqual([]);
  });
});

describe('media bundle naming (T63 §10.3)', () => {
  it('formats aflulit-media-<runId>.json from a newId-style run id and parses back', () => {
    const runId = 'mg1x2k3a-abc12def00';
    const name = mediaFileName(runId);
    expect(name).toBe(`aflulit-media-${runId}.json`);
    expect(MEDIA_FILE_RE.test(name)).toBe(true);
    expect(parseMediaFileName(name)).toBe(runId);
  });

  it('is disjoint from the snapshot names, and never a retention candidate', () => {
    const name = mediaFileName('mg1x2k3a-abc12def00');
    expect(parseBackupFileName(name)).toBeNull();
    expect(planRetention([name, nameFor('2026-01-01'), nameFor('2026-08-01')]).prune).toEqual([]);
    expect(parseMediaFileName('aflulit-backup-20260823-030709Z.json')).toBeNull();
  });

  it('refuses run ids that could escape the name (separators, uppercase, too short)', () => {
    expect(() => mediaFileName('../x')).toThrow();
    expect(() => mediaFileName('ABC-def')).toThrow();
    expect(() => mediaFileName('ab')).toThrow();
    expect(parseMediaFileName('aflulit-media-../x.json')).toBeNull();
  });
});

describe('syncd name contract', () => {
  // THE NAME CONTRACT (T11). Mirrored literally from AflulitAPI
  // `internal/naming/naming_test.go` (`nameContract`) — keep the two in sync:
  // a rename or a regex change on either side must break both tests. The
  // name doubles as the server's path-traversal guard, so every separator
  // row here is a security case. Columns: name, valid, media, reason.
  const rows: [string, boolean, boolean, string][] = [
    // Snapshots.
    ['aflulit-backup-20260823-030709Z.json', true, false, 'canonical snapshot'],
    ['aflulit-backup-20261231-235959Z.json', true, false, 'last second of a year'],
    ['aflulit-backup-20260823-030709.json', false, false, 'missing Z'],
    ['aflulit-backup-20260823-030709Z.json.bak', false, false, 'trailing suffix'],
    ['aflulit-backup-2026082-030709Z.json', false, false, 'seven-digit date'],
    ['aflulit-backup-20261301-030709Z.json', false, false, 'month 13'],
    ['aflulit-backup-20260230-030709Z.json', false, false, 'Feb 30'],
    ['aflulit-backup-20260823-240000Z.json', false, false, 'hour 24'],
    ['aflulit-backup-20260823-036000Z.json', false, false, 'minute 60'],
    ['sumrak-backup-20260823-030709Z.json', false, false, 'old product prefix'],
    ['AFLULIT-BACKUP-20260823-030709Z.json', false, false, 'uppercase prefix'],
    // Media bundles.
    ['aflulit-media-mg1x2k3a-abc12def00.json', true, true, 'scenario run id'],
    ['aflulit-media-exam-mkxy1abc-q7ztuv00.json', true, true, 'exam attempt stem'],
    ['aflulit-media-abcd.json', true, true, '4-char run id (minimum)'],
    [`aflulit-media-${'a'.repeat(80)}.json`, true, true, '80-char run id (maximum)'],
    ['aflulit-media-abc.json', false, false, '3-char run id (too short)'],
    [`aflulit-media-${'a'.repeat(81)}.json`, false, false, '81-char run id (too long)'],
    ['aflulit-media--abcd.json', false, false, 'run id starting with a dash'],
    ['aflulit-media-ABCD-efgh.json', false, false, 'uppercase run id'],
    ['aflulit-media-ab_cd.json', false, false, 'underscore in run id'],
    ['aflulit-media-../x.json', false, false, 'traversal in run id'],
    ['sumrak-media-mg1x2k3a-abc12def00.json', false, false, 'old product prefix'],
    // Strangers and traversal.
    ['', false, false, 'empty'],
    ['manifest.json', false, false, 'manifest'],
    ['../etc/passwd', false, false, 'traversal'],
    ['../aflulit-backup-20260823-030709Z.json', false, false, 'traversal before a valid name'],
    ['aflulit-backup-20260823-030709Z.json/./x', false, false, 'path after a valid name'],
    ['aflulit-backup-20260823-030709Z.json\n', false, false, 'trailing newline'],
    ['aflulit-backup-20260823-030709Z.json\x00', false, false, 'embedded NUL'],
    [' aflulit-backup-20260823-030709Z.json', false, false, 'leading space'],
  ];

  // The app's equivalent of the server's Valid / IsMedia / Parse.
  const isMedia = (name: string) => parseMediaFileName(name) !== null;
  const isValid = (name: string) => parseBackupFileName(name) !== null || isMedia(name);

  it.each(rows)('%s → valid=%s media=%s (%s)', (name, valid, media) => {
    expect(isValid(name)).toBe(valid);
    expect(isMedia(name)).toBe(media);
    // A snapshot parses; a media bundle or a stranger never does.
    expect(parseBackupFileName(name) !== null).toBe(valid && !media);
  });

  it('has the same row count as the Go table', () => {
    expect(rows).toHaveLength(30);
  });
});

describe('exam media bundle naming (T74, TORFL §8.5)', () => {
  // AflulitAPI `internal/naming/naming.go:24` — the server-side acceptance regex, copied verbatim
  // so a rename on either side breaks this test: lowercase stems only, 4–80 chars.
  const SYNCD_MEDIA_FILE_RE = /^aflulit-media-([a-z0-9][a-z0-9-]{3,79})\.json$/;

  it('an exam bundle is aflulit-media-exam-<attemptid>.json with the id lowercased — accepted by syncd', () => {
    const attemptId = 'MKXY1ABC-Q7zTuV00';
    const name = mediaFileName(examBundleStem(attemptId));
    expect(name).toBe('aflulit-media-exam-mkxy1abc-q7ztuv00.json');
    expect(SYNCD_MEDIA_FILE_RE.test(name)).toBe(true);
    expect(MEDIA_FILE_RE.test(name)).toBe(true);
    expect(parseMediaFileName(name)).toBe('exam-mkxy1abc-q7ztuv00');
  });

  it('the uppercase id itself would have been refused — the lowercase stem is the fix', () => {
    expect(SYNCD_MEDIA_FILE_RE.test('aflulit-media-exam-MKXY1ABC.json')).toBe(false);
    expect(() => mediaFileName('exam-MKXY1ABC')).toThrow();
  });

  it('never collides with a scenario run bundle and is never a snapshot retention candidate', () => {
    const name = mediaFileName(examBundleStem('mg1x2k3a-abc12def00'));
    expect(name).not.toBe(mediaFileName('mg1x2k3a-abc12def00'));
    expect(parseBackupFileName(name)).toBeNull();
    expect(planRetention([name, nameFor('2026-01-01')]).prune).toEqual([]);
  });
});
