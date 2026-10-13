import numpy as np
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
