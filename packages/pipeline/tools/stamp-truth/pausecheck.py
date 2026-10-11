"""Independent per-track staleness estimator for ALL tracks (no Whisper, no restamp): at every audio pause >=120 ms,
the word that CTC identity says follows it must START within a few ms of the energy onset, and the word before must END
at the energy offset. Reports median/p90 of (published stamp - energy edge). Calibrated against the frozen truth (README).
usage: pausecheck.py AFTER_DIR_or_'-' out.json  (AFTER_DIR: also score restamped packs)"""
import sys,json,glob,statistics as S,os
sys.path.insert(0,__file__.rsplit('/',1)[0])
from lib import *
from build_truth_edges import edges
AFT=sys.argv[1].rstrip("/")+"/" if sys.argv[1]!="-" else "-"; res={}
jobs=json.load(open('/tmp/t80/jobs-all.json'))
for j in jobs:
    base=os.path.basename(j['out']).replace('.ctc.json',''); pack,tid=base.split('__')
    d=pack_json(pack); st,a=find(d,tid)
    words=words_of(st); order=[w for w,_ in words]
    c={w['id']:(w['startMs'],w['endMs'],w['aligned']) for w in json.load(open(j['out']))['words']}
    db=frame_db(audio_path(pack,a)); floor=float(np.percentile(db,5)); pauses=edges(db,floor)
    om=stamps_map(a); nm=stamps_map(find(pack_json(pack,AFT),tid)[1]) if AFT!='-' else None
    r={'oldS':[],'oldE':[],'newS':[],'newE':[]}
    for offE,onE in pauses:
        nxt=next((w for w in order if c[w][2] and c[w][0]>=onE-150),None)
        if nxt and c[nxt][0]-onE<=700 and db[onE//5+2]>floor+25 and nxt in om:
            r['oldS'].append(om[nxt][0]-onE); 
            if nm: r['newS'].append(nm[nxt][0]-onE)
        prv=next((w for w in reversed(order) if c[w][2] and c[w][1]<=offE+150),None)
        if prv and offE-c[prv][1]<=700 and prv in om:
            r['oldE'].append(om[prv][1]-offE)
            if nm: r['newE'].append(nm[prv][1]-offE)
    res[base]={k:v for k,v in r.items()}
json.dump(res,open(sys.argv[2],'w'))
