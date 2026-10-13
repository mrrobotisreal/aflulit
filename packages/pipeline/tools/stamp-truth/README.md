# T80b frozen stamp truth set + independent judge

- `truth-set-v1.json` — frozen 14-track truth set (2,028 boundaries): class P = 131 pause-edge boundaries (energy edge, identity confirmed by Whisper large-v3 + CTC); class W = 1,897 word-interior boundaries (Whisper large-v3 agreeing with the old stamp corrected by its local median offset within 70 ms). Source audio = `aflulit-content` published opus (read-only). Whisper large-v3 word times are NOT committed (re-run `wh_large.py`).
- Builders: `wh_large.py` (large-v3 word times) -> `build_truth.py` -> `build_truth2.py`; scorers `evalpacks.py` (packs vs truth), `pausecheck.py` (every track, no restamp involved), `slicecheck.py` (120-word large-v3 slice check), `worklist.py` (CT045 list).
- Run with a python3.12 venv that has numpy + faster-whisper (see Stories/_build/stamp-audit-2026-10-10/after-T80b/README.md). Paths inside are the local workspace paths used for T80b.
- The full results, per-track tables and the regenerated CT045 list live in `Stories/_build/stamp-audit-2026-10-10/after-T80b/`.
