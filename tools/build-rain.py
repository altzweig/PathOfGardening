# Builds the rain / thunderstorm sounds in public/audio/ (rain_light.mp3, rain_heavy.mp3, thunder_1-6.mp3).
# Sources (Freesound, CC0), converted to 44.1 kHz WAV into D first (ffmpeg -i <src> -ar 44100 -c:a pcm_s16le <name>.wav):
#   roof.wav        869487__thelittlecrow__rooftop-rain-perspective-a.wav
#   drips.wav       853565__hoshisato__rain-and-drips.mp3 (mono)
#   storm.wav       877124__adamdavidsmith__ambience_rain_thunder-2.wav
#   thunderrain.wav 867416__kbro935__thunderrain_sfx.mp3 (mono)
# Loops: 24 s, the 3 s tail is equal-power crossfaded into the head, so they repeat without a cut.
# Needs numpy, scipy, soundfile, ffmpeg. Run: python3 tools/build-rain.py, then copy D/out/*.mp3 to public/audio/.
import numpy as np, soundfile as sf, subprocess
from scipy.signal import butter, sosfilt
D='/tmp/claude-0/rain/'; OUT='/tmp/claude-0/rain/out/'
import os; os.makedirs(OUT,exist_ok=True)
SR=44100; L=24.0; X=3.0
def load(f):
    x,sr=sf.read(D+f); assert sr==SR
    return x if x.ndim==2 else np.stack([x,x],1)
def seg(x,a,b): return x[int(a*SR):int(b*SR)].copy()
def mono(x): return x.mean(1)
def rms(x): return np.sqrt(np.mean(x**2))
def hp(x,f,o=2): return sosfilt(butter(o,f,'high',fs=SR,output='sos'),x,axis=0)
def lp(x,f,o=2): return sosfilt(butter(o,f,'low',fs=SR,output='sos'),x,axis=0)
def loopify(x):
    n=int(L*SR); k=int(X*SR); assert len(x)>=n+k
    y=x[:n].copy(); t=np.linspace(0,1,k)[:,None]
    y[:k]=x[:k]*np.sin(t*np.pi/2)+x[n:n+k]*np.cos(t*np.pi/2)   # tail crossfaded into head (equal power)
    return y
def norm(x,db): return x*(10**(db/20)/rms(x))
def limit(x,thr_db=-1.5):
    from scipy.ndimage import maximum_filter1d, uniform_filter1d
    thr=10**(thr_db/20); a=np.abs(x).max(1) if x.ndim==2 else np.abs(x)
    g=np.minimum(1,thr/np.maximum(a,1e-9)); w=int(.006*SR)
    g=-maximum_filter1d(-g,2*w+1); g=uniform_filter1d(g,w)   # look-ahead min, smoothed
    g=np.minimum(g,np.minimum(1,thr/np.maximum(a,1e-9)))
    return x*(g[:,None] if x.ndim==2 else g)
def write(name,x,br):
    x=limit(x)
    w=OUT+name+'.wav'; sf.write(w,np.clip(x,-1,1),SR,subtype='PCM_16')
    subprocess.run(['ffmpeg','-loglevel','error','-y','-i',w,'-c:a','libmp3lame','-b:a',br,OUT+name+'.mp3'],check=True)
    print(name, len(x)/SR,'s rms',round(20*np.log10(rms(x)),1),'peak',round(20*np.log10(np.abs(x).max()),1))

roof=load('roof.wav'); drips=load('drips.wav'); storm=load('storm.wav'); tr=load('thunderrain.wav')
T=L+X
# light: soft roof patter, decorrelated L/R from two parts of the take, plus the close drips
lr=np.stack([mono(seg(roof,100,100+T)),mono(seg(roof,207.5,207.5+T))],1)
dr=mono(seg(drips,1,1+T)); dr=np.stack([dr*0.8,np.roll(dr,int(.013*SR))],1)
light=hp(norm(lr,-24)+norm(dr,-27),90)
write('rain_light',norm(loopify(light),-22),'112k')
# heavy: steady stereo storm rain plus the dense downpour (with its low distant rumble)
st=seg(storm,6,6+T); dp=mono(seg(tr,144,144+T)); dp=np.stack([dp,np.roll(dp,int(.021*SR))],1)
heavy=hp(norm(st,-22)+norm(dp,-23),60)
write('rain_heavy',norm(loopify(heavy),-19),'112k')
# thunder one-shots (mono): peak at ~2.5 s, rain hiss above 3 kHz tamed so the claps do not bump the rain bed
peaks=[(tr,16.5),(tr,86.25),(tr,115.75),(tr,140.25),(tr,183.5),(storm,215.0)]
for i,(src,p) in enumerate(peaks,1):
    x=mono(seg(src,p-2.5,p+9.5)); hiss=hp(x,3000,4); x=x-0.6*hiss
    n=len(x); env=np.ones(n); a=int(.4*SR); r=int(3.5*SR)
    env[:a]=np.linspace(0,1,a)**2; env[-r:]=np.linspace(1,0,r)**2; x*=env
    x=x*(10**(-1/20)/np.abs(x).max())
    write(f'thunder_{i}',x,'96k')
