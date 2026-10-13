"""Score published (old) vs restamped packs against the frozen truth. usage: evalpacks.py truth.json AFTER_DIR [class]"""
import sys,json,statistics as S
sys.path.insert(0,__file__.rsplit('/',1)[0])
from lib import *
truth=json.load(open(sys.argv[1])); AFT=sys.argv[2]+'/'; CLS=sys.argv[3] if len(sys.argv)>3 else None
p90=lambda xs:sorted(abs(x) for x in xs)[int(len(xs)*.9)] if xs else 0
tot={'old':{'start':[],'end':[]},'new':{'start':[],'end':[]}}; small=n=0
rows=[]
for key in truth['tracks']:
    pack,tid=key.split(':')
    so,ao=find(pack_json(pack),tid); sn,an=find(pack_json(pack,AFT),tid)
    mo,mn=stamps_map(ao),stamps_map(an)
    r={}
    for b in truth['boundaries']:
        if b['track']!=tid or b['pack']!=pack or (CLS and b.get('class')!=CLS): continue
        j=0 if b['kind']=='start' else 1
        for tag,m in (('old',mo),('new',mn)):
            if b['id'] in m: r.setdefault((tag,b['kind']),[]).append(m[b['id']][j]-b['ms'])
    rows.append((tid,r))
    for k,v in r.items(): tot[k[0]][k[1]]+=v
f=lambda v:f"n={len(v):3d} med {S.median(v):+5.0f} p90 {p90(v):4.0f}" if v else "n=  0"
for tid,r in rows:
    print(tid[:24].ljust(24),'| start old',f(r.get(('old','start'),[])),'new',f(r.get(('new','start'),[])),'| end old',f(r.get(('old','end'),[])),'new',f(r.get(('new','end'),[])))
for k in ('old','new'):
    print('ALL',k,'start',f(tot[k]['start']),f'<=100:{sum(abs(x)<=100 for x in tot[k]["start"])/max(1,len(tot[k]["start"])):.2f}','end',f(tot[k]['end']),f'<=100:{sum(abs(x)<=100 for x in tot[k]["end"])/max(1,len(tot[k]["end"])):.2f}')
