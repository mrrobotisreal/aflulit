"""CT045 work list from the T80b dry run: only packs with >=1 restamped track. usage: worklist.py DRYRUN_DIR out.md"""
import json,sys,collections,statistics as S
sys.path.insert(0,__file__.rsplit('/',1)[0])
from lib import *
D=sys.argv[1].rstrip('/')+'/'
kept={(k['pack'],k['track']):k['keep'] for k in json.load(open(D+'kept.json'))}
bef=json.load(open(D+'audit-before.json')); aft=json.load(open(D+'audit-after.json'))
rows=collections.OrderedDict()
for b,a in zip(bef,aft):
    r=rows.setdefault(b['pack'],dict(tracks=0,kept=0,re=0,fail_after=0,ws=0,we=0,steps=0,drift=0,clip=[]))
    r['tracks']+=1
    if kept[(b['pack'],b['trackId'])]: r['kept']+=1; continue
    r['re']+=1; r['fail_after']+= (not a['ok'])
    if b['edge']: r['ws']=max(r['ws'],abs(b['edge']['startMedianMs'])); r['we']=max(r['we'],abs(b['edge']['endMedianMs']))
    r['steps']+= b['maxStepMs']>250; r['drift']=max(r['drift'],abs(b['driftMsPerMin'])); r['clip'].append(b['endClipRate'])
L=['# CT045 work list (T80b) — republish ONLY these packs','',
 'Source: T80b dry run (`dry-run/`), restamp = CTC + start-extension + end-extension + pause-edge audit gate; healthy tracks (audit passes) are left byte-identical (`kept.json`).',
 'Judged against the frozen truth set (`truth/truth-set-v1.json`) and the independent Whisper survey, NOT against the restamp itself. `after fail` = restamped tracks that still fail the pause-edge audit gate (these need an eyeball / a re-render, listed in `residual-failing-tracks.md`).','',
 '| pack | tracks | kept (byte-identical) | restamp | worst start-median at pauses (ms) | worst end-median at pauses (ms) | steps >250 | worst drift ms/min | end-clip % before | after fail |','|---|---|---|---|---|---|---|---|---|---|']
n=0
for p,r in rows.items():
    if r['re']==0: continue
    n+=1
    L.append(f"| {p} | {r['tracks']} | {r['kept']} | {r['re']} | {r['ws']} | {r['we']} | {r['steps']} | {r['drift']:.0f} | {round(100*S.mean(r['clip']))} | {r['fail_after']} |")
L+=['',f'**{n} packs need CT045**, {sum(r["re"] for r in rows.values())} of {sum(r["tracks"] for r in rows.values())} tracks restamped, {sum(r["kept"] for r in rows.values())} kept byte-identical. Packs with all tracks kept: '+(', '.join(p for p,r in rows.items() if r['re']==0) or 'none')+'.']
open(sys.argv[2],'w').write('\n'.join(L)+'\n')
res=['# Residual failing tracks after restamp (pause-edge gate)','','| pack | track | start med/p90 | end med/p90 | failures |','|---|---|---|---|---|']
for b,a in zip(bef,aft):
    if not kept[(b['pack'],b['trackId'])] and not a['ok']:
        e=a['edge']; res.append(f"| {b['pack']} | {b['trackId']} | {e['startMedianMs']}/{e['startP90Ms']} | {e['endMedianMs']}/{e['endP90Ms']} | {'; '.join(a['failures'])} |")
open(sys.argv[2].replace('CT045-work-list.md','residual-failing-tracks.md'),'w').write('\n'.join(res)+'\n')
print(n,'packs')
