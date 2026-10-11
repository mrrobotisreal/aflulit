"""120-word slice check, Whisper large-v3 as judge. Words: random >=5-letter content words from the 14 truth tracks.
Windows: 'old' = [start-40, end+60]; 't79' = T79 slice-window.ts math (neighbour-aware). Stamps: published (old) vs T80b dry-run (new).
usage: slicecheck.py truth.json AFTER_DIR out.json [N]"""
import sys,json,random,subprocess,numpy as np
sys.path.insert(0,__file__.rsplit('/',1)[0])
from lib import *
from faster_whisper import WhisperModel
truth=json.load(open(sys.argv[1])); AFT=sys.argv[2]+'/'; N=int(sys.argv[4]) if len(sys.argv)>4 else 120
clamp=lambda v,lo,hi:min(hi,max(lo,v))
def t79(st,pv,nx):
    li=120
    if pv:
        g=st[0]-pv[1]
        if g<=400: li=max(0,min(clamp(g*.5,15,120),g/2))
    lo=160
    if nx:
        g=nx[0]-st[1]
        if g<=400: lo=max(0,min(clamp(g*.5,25,160),g/2))
    return max(0,st[0]-li),st[1]+lo
cands=[]
for key in truth['tracks']:
    pack,tid=key.split(':'); d=pack_json(pack); st,a=find(d,tid); dn=pack_json(pack,AFT); _,an=find(dn,tid)
    toks={f"{s['id']}:{i}":t['text'] for s in st['sentences'] for i,t in enumerate(s['tokens'])}
    def order(x): return sorted(x['timestamps'],key=lambda w:w['startMs'])
    oo,nn=order(a),order(an)
    for k,(wo,wn) in enumerate(zip(oo,nn)):
        wid=f"{wo['sentenceId']}:{wo['tokenIndex']}"
        if wid!=f"{wn['sentenceId']}:{wn['tokenIndex']}": continue
        if len(norm(toks.get(wid,'')))>=5:
            cands.append((pack,tid,audio_path(pack,a),toks[wid],
              {'old':((wo['startMs'],wo['endMs']),(oo[k-1]['startMs'],oo[k-1]['endMs']) if k else None,(oo[k+1]['startMs'],oo[k+1]['endMs']) if k+1<len(oo) else None),
               'new':((wn['startMs'],wn['endMs']),(nn[k-1]['startMs'],nn[k-1]['endMs']) if k else None,(nn[k+1]['startMs'],nn[k+1]['endMs']) if k+1<len(nn) else None)}))
random.seed(80); pick=random.sample(cands,N)
m=WhisperModel('/tmp/t80b/large-v3',device='cpu',compute_type='int8',cpu_threads=4)
def clip(path,a,b):
    raw=subprocess.run(['ffmpeg','-v','error','-ss',str(a/1000),'-t',str(max(0.05,(b-a)/1000)),'-i',path,'-ac','1','-ar','16000','-f','f32le','-'],capture_output=True,check=True).stdout
    return np.frombuffer(raw,dtype='<f4').copy()
score={}; rows=[]
for pack,tid,path,txt,S in pick:
    r={'pack':pack,'track':tid,'word':txt}
    for stamps in ('old','new'):
        (s,pv,nx)=S[stamps]
        for wtag,(a,b) in (('t79',t79(s,pv,nx)),('pm40_60',(max(0,s[0]-40),s[1]+60))):
            segs,_=m.transcribe(clip(path,a,b),language='ru',beam_size=1,condition_on_previous_text=False,temperature=0.0)
            out=norm(' '.join(x.text for x in segs)); ok=out==norm(txt)
            score[(stamps,wtag)]=score.get((stamps,wtag),0)+ok; r[f'{stamps}_{wtag}']=[ok,out]
    rows.append(r); print(len(rows),{f'{a}/{b}':v for (a,b),v in score.items()},flush=True)
json.dump({'n':N,'score':{f'{a}/{b}':v for (a,b),v in score.items()},'rows':rows},open(sys.argv[3],'w'),ensure_ascii=False,indent=1)
