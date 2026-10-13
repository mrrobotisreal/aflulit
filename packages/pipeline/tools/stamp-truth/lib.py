import json,re,difflib,subprocess,numpy as np,os
R='/Users/mitchwintrow/Workspaces/Russian/'
P=R+'aflulit-content/packs/'
D=R+'Stories/_build/stamp-audit-2026-10-10/'
def norm(s): return re.sub(r'[^а-я]','',s.lower().replace('ё','е'))
def pack_json(pack,after=None):
    return json.load(open(P+pack+'/pack.json')) if after is None else json.load(open(after+pack+'.pack.json'))
def find(d,tid):
    for st in d['stories']:
        for a in st['audio']:
            if a['id']==tid: return st,a
def words_of(st):
    out=[]
    for s in st['sentences']:
        for i,t in enumerate(s['tokens']):
            if not t.get('isPunct'): out.append((f"{s['id']}:{i}",t['text']))
    return out
def stamps_map(a): return {f"{w['sentenceId']}:{w['tokenIndex']}":(w['startMs'],w['endMs']) for w in a['timestamps']}
def whisper_match(words,wh):
    """map word id -> (start_ms,end_ms) for exact normalised matches"""
    ww=[(norm(x[0]),x[1],x[2]) for x in wh if norm(x[0])]
    ref=[(norm(t),i) for i,(_,t) in enumerate(words) if norm(t)]
    sm=difflib.SequenceMatcher(None,[w[0] for w in ww],[r[0] for r in ref],autojunk=False)
    out={}
    for b in sm.get_matching_blocks():
        for k in range(b.size):
            _,s,e=ww[b.a+k]; out[words[ref[b.b+k][1]][0]]=(round(s*1000),round(e*1000))
    return out
def frame_db(path):
    raw=subprocess.run(['ffmpeg','-v','error','-i',path,'-ac','1','-ar','16000','-f','f32le','-'],capture_output=True,check=True).stdout
    x=np.frombuffer(raw,dtype='<f4'); n=len(x)//80
    return 20*np.log10(np.sqrt((x[:n*80].reshape(n,80)**2).mean(1))+1e-9)
def ctc(pack,tid):
    return {w['id']:(w['startMs'],w['endMs'],w['aligned']) for w in json.load(open(f'/tmp/t80/all/{pack}__{tid}.ctc.json'))['words']}
def audio_path(pack,a): return P+pack+'/'+a['file']
