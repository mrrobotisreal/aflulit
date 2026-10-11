"""Frozen truth set builder (T80b).
A truth boundary = a PAUSE EDGE: the audio has >= 120 ms of near-silence (floor+14 dB); the energy onset after it is the
true start of the first word after the pause, the energy offset before it is the true end of the last word before it.
Votes (two of three must agree for a boundary to be frozen):
  (a) energy edge (rise/fall to within 34 dB of the local peak, never above floor+20),
  (b) faster-whisper large-v3: the word it assigns to that side of the pause (same surface as the pack word; its start
      <= onset+150 / its end >= offset-150: Whisper times are known to straddle the pause so only 'consistent with' is required),
  (c) the OLD published stamp, only where that old track is healthy (|median(whisper-old)| <= 60 ms), within 100 ms.
Energy+whisper-consistency are two votes by construction; (c) is the third, used for tracks where it is valid.
usage: build_truth.py out.json pack:trackId ...   (needs /tmp/t80b/wh3/<pack>__<track>.wh.json)"""
import sys,json,statistics as S
sys.path.insert(0,__file__.rsplit('/',1)[0])
from lib import *
def edges(db,floor,minsil=24):
    sil=floor+14; quiet=db<sil; n=len(db); f=0; pauses=[]
    while f<n:
        if quiet[f]:
            g=f
            while g<n and quiet[g]: g+=1
            if g-f>=minsil:
                if f>0 and g<n:
                    pk=db[max(0,f-20):f].max(); thr=max(pk-34,floor+20); h=f
                    while h>max(0,f-120) and db[h-1]<thr: h-=1
                    pk=db[g:g+20].max(); thr=max(pk-34,floor+20); k=g
                    while k<min(n-1,g+120) and db[k]<thr: k+=1
                    pauses.append((h*5,k*5))
            f=g
        else: f+=1
    return pauses
out={'built':'T80b','method':__doc__,'tracks':{},'boundaries':[]}
for spec in sys.argv[2:]:
    pack,tid=spec.split(':')
    d=pack_json(pack); st,a=find(d,tid); words=words_of(st)
    wh=whisper_match(words,json.load(open(f'/tmp/t80b/wh3/{pack}__{tid}.wh.json')))
    old=stamps_map(a); db=frame_db(audio_path(pack,a)); floor=float(np.percentile(db,5))
    healthy=abs(S.median([wh[k][0]-old[k][0] for k in wh if k in old]))<=60
    matched=set(wh); pidx={w:i for i,(w,_) in enumerate(words)}
    pauses=edges(db,floor); wl=[(wid,txt,*wh[wid]) for wid,txt in words if wid in wh]
    n=0
    def solid(a0,a1):
        # no internal near-silence >= 80 ms inside [a0,a1] (else Whisper's word span is not one continuous word)
        seg=db[max(0,a0//5):max(1,a1//5)]<floor+14; run=0
        for q in seg:
            run=run+1 if q else 0
            if run>=16: return False
        return True
    def add(wid,txt,kind,edge,ww):
        global n
        if kind=='start' and not solid(edge+10,ww[1]-120): return
        if kind=='end' and not solid(ww[0]+120,edge-10): return
        o=old.get(wid); c=(o[0] if kind=='start' else o[1]) if (o and healthy) else None
        out['boundaries'].append({'pack':pack,'track':tid,'id':wid,'text':txt,'kind':kind,'ms':int(edge),'whisper':list(ww),'old':c,'oldAgrees':c is not None and abs(c-edge)<=100}); n+=1
    # Identity from TWO aligners (Whisper large-v3 and the CTC pass must name the same word as the first/last word at the
    # pause edge, and Whisper must place it within 200 ms of the edge); TIME from the audio energy edge.
    cc=ctc(pack,tid); order=[w for w,_ in words]
    for offE,onE in pauses:
        nxt=next((w for w in order if cc[w][2] and cc[w][0]>=onE-150),None)
        if nxt and nxt in wh and len(norm(dict(words)[nxt]))>=3 and abs(wh[nxt][0]-onE)<=120 and db[onE//5+2]>floor+25 and cc[nxt][0]-onE<=700:
            add(nxt,dict(words)[nxt],'start',onE,wh[nxt])
        prv=next((w for w in reversed(order) if cc[w][2] and cc[w][1]<=offE+150),None)
        if prv and prv in wh and len(norm(dict(words)[prv]))>=3 and abs(wh[prv][1]-offE)<=150 and offE-cc[prv][1]<=700:
            add(prv,dict(words)[prv],'end',offE,wh[prv])
    out['tracks'][pack+':'+tid]={'oldHealthy':healthy,'words':len(words),'whisperMatched':len(wh),'boundaries':n}
    print(pack,tid,out['tracks'][pack+':'+tid],flush=True)
out['total']=len(out['boundaries'])
json.dump(out,open(sys.argv[1],'w'),ensure_ascii=False,indent=1); print('total',out['total'])
