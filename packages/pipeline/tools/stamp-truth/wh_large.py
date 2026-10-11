# faster-whisper large-v3 word timestamps for named tracks. usage: wh_large.py OUTDIR THREADS key1 key2 ...  (key = substring of the jobs-all out name)
import json,sys,os,subprocess,numpy as np
from faster_whisper import WhisperModel
outd,thr,keys=sys.argv[1],int(sys.argv[2]),sys.argv[3:]
jobs=json.load(open('/tmp/t80/jobs-all.json'))
m=WhisperModel('/tmp/t80b/large-v3',device='cpu',compute_type='int8',cpu_threads=thr)
def load(p):
    raw=subprocess.run(['ffmpeg','-v','error','-i',p,'-ac','1','-ar','16000','-f','f32le','-'],capture_output=True,check=True).stdout
    return np.frombuffer(raw,dtype='<f4').copy()
for j in jobs:
    base=os.path.basename(j['out']).replace('.ctc.json','')
    if base not in keys: continue
    out=f'{outd}/{base}.wh.json'
    if os.path.exists(out): continue
    segs,_=m.transcribe(load(j['audio']),language='ru',word_timestamps=True,condition_on_previous_text=False,beam_size=5)
    ws=[[x.word,round(x.start,3),round(x.end,3),round(x.probability,3)] for s in segs for x in s.words]
    json.dump(ws,open(out+'.tmp','w'),ensure_ascii=False); os.rename(out+'.tmp',out); print(base,len(ws),flush=True)
