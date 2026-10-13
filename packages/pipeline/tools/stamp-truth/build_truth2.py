"""Adds class W (word-interior boundaries) to the frozen set: whisper large-v3 start/end AND the OLD stamp corrected by
the local (+-12 words) median whisper-old offset agree within 70 ms -> boundary = mean of the two.  usage: build_truth2.py base.json out.json"""
import sys,json,statistics as S
sys.path.insert(0,__file__.rsplit('/',1)[0])
from lib import *
base=json.load(open(sys.argv[1])); keys=list(base['tracks']); out=base
for key in keys:
    pack,tid=key.split(':'); d=pack_json(pack); st,a=find(d,tid); words=words_of(st)
    wh=whisper_match(words,json.load(open(f'/tmp/t80b/wh3/{pack}__{tid}.wh.json'))); old=stamps_map(a)
    ids=[w for w,_ in words if w in wh and w in old]; txt=dict(words)
    have={(b['id'],b['kind']) for b in base['boundaries'] if b['track']==tid}
    n=0
    for k,wid in enumerate(ids):
        if len(norm(txt[wid]))<3: continue
        for kind,j in (('start',0),('end',1)):
            if (wid,kind) in have: continue
            win=ids[max(0,k-12):k+13]
            loc=S.median([wh[x][j]-old[x][j] for x in win])
            c=old[wid][j]+loc; w=wh[wid][j]
            if abs(c-w)<=70:
                out['boundaries'].append({'pack':pack,'track':tid,'id':wid,'text':txt[wid],'kind':kind,'ms':int((c+w)/2),'whisper':wh[wid],'old':old[wid][j],'class':'W','localOffset':loc}); n+=1
    out['tracks'][key]['W']=n; print(key,n)
for b in out['boundaries']: b.setdefault('class','P')
out['total']=len(out['boundaries']); json.dump(out,open(sys.argv[2],'w'),ensure_ascii=False,indent=1); print('total',out['total'])
