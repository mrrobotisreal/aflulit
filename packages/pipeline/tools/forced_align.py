#!/usr/bin/env python3
"""Forced alignment of known words against audio (T80).

Usage: forced_align.py (--audio FILE --words words.json --out out.json | --jobs jobs.json)
                       [--engine ctc-ru|whisper] [--device cpu|mps]
  words.json: [{"id": "<anything>", "text": "<surface>"} ...]  (reading order)
  out.json:   {"engine": ..., "words": [{"id", "startMs", "endMs", "aligned": bool}]}

Engines:
  ctc-ru   wav2vec2 Russian CTC (jonatasgrosman/wav2vec2-large-xlsr-53-russian)
           + torchaudio.functional.forced_align. Deterministic, no network
           once the model is cached (HF_HOME). Token spans are PEAKY (the
           word end lands early) — restamp.ts extends ends by energy.
  whisper  faster-whisper word timestamps matched to the known words
           (difflib). Bake-off baseline only.

Words with no Cyrillic letters (digits, Latin) cannot be aligned by the CTC
model: they are interpolated between aligned neighbours (aligned=false).
Runtime: python3.12 venv with torch, torchaudio, transformers, numpy
(+ faster-whisper for the whisper engine). Never needs an API key.
"""
import argparse, json, re, subprocess, sys

MODEL = "jonatasgrosman/wav2vec2-large-xlsr-53-russian"
SR = 16000
FOLD = {"і": "и", "ї": "и", "є": "е", "ґ": "г"}


def load_audio(path):
    import numpy as np
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
        capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype="<f4").copy()


def clean(word):
    w = word.lower()
    w = "".join(FOLD.get(c, c) for c in w)
    return "".join(c for c in w if "а" <= c <= "я" or c == "ё")


def interpolate(out, total_ms):
    n = len(out)
    i = 0
    while i < n:
        if out[i]["aligned"]:
            i += 1
            continue
        j = i
        while j < n and not out[j]["aligned"]:
            j += 1
        lo = out[i - 1]["endMs"] if i > 0 else 0
        hi = out[j]["startMs"] if j < n else total_ms
        k = j - i
        span = max(0, hi - lo)
        for m in range(k):
            out[i + m]["startMs"] = lo + span * m // k
            out[i + m]["endMs"] = lo + span * (m + 1) // k
        i = j


_CTC = {}


def ctc_model(device):
    if device not in _CTC:
        from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor
        proc = Wav2Vec2Processor.from_pretrained(MODEL)
        _CTC[device] = (proc, Wav2Vec2ForCTC.from_pretrained(MODEL).to(device).eval())
    return _CTC[device]


def run_ctc(audio, words, device):
    import numpy as np, torch, torchaudio.functional as F
    proc, model = ctc_model(device)
    vocab = proc.tokenizer.get_vocab()
    blank = vocab["<pad>"]
    # Emissions in 20 s windows with 2 s context each side, centre parts stitched.
    win, ctx = 20 * SR, 2 * SR
    frames = []
    pos = 0
    with torch.inference_mode():
        while pos < len(audio):
            a0, a1 = max(0, pos - ctx), min(len(audio), pos + win + ctx)
            x = audio[a0:a1]
            x = (x - x.mean()) / (x.std() + 1e-7)
            lg = model(torch.from_numpy(x)[None].to(device)).logits[0].float().log_softmax(-1).cpu()
            f0 = int(round((pos - a0) / 320))
            f1 = lg.shape[0] if pos + win >= len(audio) else int(round((pos + win - a0) / 320))
            frames.append(lg[f0:f1])
            pos += win
    em = torch.cat(frames)  # [T, V]
    total_ms = int(len(audio) * 1000 / SR)
    toks, owner = [], []
    for wi, w in enumerate(words):
        for c in clean(w["text"]):
            if c in vocab:
                toks.append(vocab[c])
                owner.append(wi)
    out = [{"id": w["id"], "startMs": 0, "endMs": 0, "aligned": False} for w in words]
    if toks and em.shape[0] >= len(toks):
        ali, _ = F.forced_align(em[None], torch.tensor([toks], dtype=torch.int32), blank=blank)
        spans = F.merge_tokens(ali[0], torch.exp(em.gather(1, ali[0][:, None])[:, 0]))
        assert len(spans) == len(toks), (len(spans), len(toks))
        for sp, wi in zip(spans, owner):
            s, e = sp.start * 20, (sp.end) * 20
            o = out[wi]
            if not o["aligned"]:
                o.update(startMs=s, endMs=e, aligned=True)
            else:
                o["endMs"] = e
    interpolate(out, total_ms)
    return out


def run_whisper(audio_path, words):
    import difflib
    from faster_whisper import WhisperModel
    m = WhisperModel("small", device="cpu", compute_type="int8")
    segs, _ = m.transcribe(audio_path, language="ru", word_timestamps=True,
                           condition_on_previous_text=False)
    ww = [(clean(x.word), x.start, x.end) for s in segs for x in s.words if clean(x.word)]
    ref = [(clean(w["text"]), i) for i, w in enumerate(words) if clean(w["text"])]
    sm = difflib.SequenceMatcher(None, [w[0] for w in ww], [r[0] for r in ref], autojunk=False)
    out = [{"id": w["id"], "startMs": 0, "endMs": 0, "aligned": False} for w in words]
    for b in sm.get_matching_blocks():
        for k in range(b.size):
            _, s, e = ww[b.a + k]
            out[ref[b.b + k][1]].update(startMs=int(s * 1000), endMs=int(e * 1000), aligned=True)
    interpolate(out, int(len(load_audio(audio_path)) * 1000 / SR))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio")
    ap.add_argument("--words")
    ap.add_argument("--out")
    ap.add_argument("--jobs", help="JSON [{audio, words, out}] — one model load for many tracks")
    ap.add_argument("--engine", default="ctc-ru", choices=["ctc-ru", "whisper"])
    ap.add_argument("--device", default="cpu")
    a = ap.parse_args()
    jobs = (json.load(open(a.jobs, encoding="utf-8")) if a.jobs
            else [{"audio": a.audio, "words": a.words, "out": a.out}])
    for j in jobs:
        words = json.load(open(j["words"], encoding="utf-8"))
        if a.engine == "ctc-ru":
            res = run_ctc(load_audio(j["audio"]), words, a.device)
        else:
            res = run_whisper(j["audio"], words)
        json.dump({"engine": a.engine, "words": res}, open(j["out"], "w", encoding="utf-8"))
        print("aligned", j["audio"], len(words), flush=True)


if __name__ == "__main__":
    sys.exit(main())
