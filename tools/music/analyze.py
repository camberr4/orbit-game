import numpy as np, soundfile as sf, sys
T='/tmp/aurora_electro'; G={'pad':.9,'arp':.7,'bass':.85,'kick':.85,'hats':.9,'lead':.8}
tot=None
for n,g in G.items():
    x,sr=sf.read(f'{T}/{n}.wav'); x=x if x.ndim>1 else np.stack([x,x],1)
    tot=x*g if tot is None else tot+x*g
m=tot.mean(1); N=sr*20
sp=np.abs(np.fft.rfft(m[:N]))**2; f=np.fft.rfftfreq(N,1/sr)
band=lambda a,b: 100*sp[(f>=a)&(f<b)].sum()/sp.sum()
print('mix rms',round(float(np.sqrt(np.mean(m**2))),3),'peak',round(float(np.abs(tot).max()),2))
print('power % <120',round(band(0,120),1),'120-500',round(band(120,500),1),'500-2k',round(band(500,2000),1),'2-5k',round(band(2000,5000),1),'>5k',round(band(5000,22050),2))
