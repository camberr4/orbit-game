import subprocess, numpy as np, soundfile as sf, librosa, os, sys, json
from strip_songs import SONGS, R   # SONGS table
def load(d,f):
    os.makedirs(d,exist_ok=True); w=f'{d}/{f}.wav'
    if not os.path.exists(w): subprocess.run(['ffmpeg','-y','-loglevel','error','-i',f'{R}/{d}/{f}.mp3','-ar','22050','-ac','1',w],check=True)
    return sf.read(w)[0]
def feats(name):
    d,dr,ot,bpm,anchor=SONGS[name]; sr=22050
    L=min(len(load(d,f)) for f in dr+ot)
    drum=sum(load(d,f)[:L] for f in dr); mix=sum(load(d,f)[:L] for f in ot)
    bar=240/bpm; t0=anchor%bar; nb=int((L/sr-t0)/bar)
    hop=512; ch=librosa.feature.chroma_stft(y=mix,sr=sr,hop_length=hop,n_fft=2048)
    fr=sr/hop; lv=[]; C=[]
    for i in range(nb):
        a=int((t0+i*bar)*sr); b=int((t0+(i+1)*bar)*sr)
        lv.append(float(np.sqrt(np.mean(drum[a:b]**2)))); fa=int((t0+i*bar)*fr); fb=max(fa+1,int((t0+(i+1)*bar)*fr))
        c=ch[:,fa:fb].mean(1); C.append(c/(np.linalg.norm(c)+1e-9))
    lv=np.array(lv); lv=lv/(np.percentile(lv,90) if os.environ.get('INTENSE') else lv.max()+1e-9); lv=np.minimum(lv,1.0)
    return dict(bar=bar,t0=t0,nb=nb,lv=lv,C=np.array(C),anchor_bar=int(round((anchor-t0)/bar)))
def cands(F,N):
    lv,C,nb=F['lv'],F['C'],F['nb']; out=[]
    for S in range(8,nb-N-1):
        w=lv[S:S+N]; hi=(w>0.55).mean(); low=(w<0.3)
        # longest low run
        run=m=0
        for v in low: run=run+1 if v else 0; m=max(m,run)
        if os.environ.get('INTENSE'):
            if hi<0.9 or w.min()<0.4: continue
        elif hi<0.5 or m<4 or m>N*0.45: continue
        seam=0.5*(C[S-1]@C[S+N-1]+C[S]@C[S+N]); lvl=1-0.5*(abs(lv[S-1]-lv[S+N-1])+abs(lv[S]-lv[S+N]))
        out.append((seam*0.6+lvl*0.4,S,seam,lvl,hi,m))
    out.sort(reverse=True); return out
if __name__=='__main__':
    for name in sys.argv[1:]:
        F=feats(name); print(name,'bars',F['nb'],'bar',round(F['bar'],3),'t0',round(F['t0'],3))
        sym=lambda v:'.' if v<0.06 else '-' if v<0.3 else '+' if v<0.6 else '#'
        for N in (32,24,16):
            for sc,S,seam,lvl,hi,m in cands(F,N)[:2]:
                strip=''.join(sym(v) for v in F['lv'][S:S+N])
                print(f' N={N} S={S} score={sc:.3f} seam={seam:.2f} lvl={lvl:.2f} hi={hi:.2f} lowrun={m}  time={F["t0"]+S*F["bar"]:.2f}s  [{strip}]')
