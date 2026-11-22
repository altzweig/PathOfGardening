"""Kampf- und Wellen-Sounds (22.11.2026): Wellen-Ankündigung aus der Ferne mit Hall, Angriff/Schaden für Waschbär, Hase und Spieler.
python3 tools/build-fight.py <ausgabe = public/audio>
Fast alles ist im Code erzeugt (Sinus/Rauschen, Formantfilter, künstlicher Hall). Einzige Aufnahme: sfx/animals/racoon_aggro.wav
(Bastis Sound-Sammlung, dieselbe Quelle wie die übrigen rac_*-Clips) für Waschbär-Schreie und den Waschbär-Chor in der Ferne.
Jeder Clip kann einfach durch eine eigene Datei gleichen Namens in public/audio/ ersetzt werden (oder neue Namen in sounds.yaml eintragen).
"""
import sys, subprocess, numpy as np, soundfile as sf
from scipy.signal import butter, sosfilt, resample_poly, fftconvolve, lfilter
SR = 44100
dst = sys.argv[1] if len(sys.argv) > 1 else 'public/audio'
rng = np.random.default_rng(22112026)

def T(d): return np.arange(int(d * SR)) / SR
def filt(x, kind, hz, order=2): return sosfilt(butter(order, hz, kind, fs=SR, output='sos'), x)
def env(n, a, r, shape=2.0):  # attack (s), release share; exponential-ish tail
    e = np.ones(n); na = max(1, int(a * SR)); e[:na] = np.linspace(0, 1, na) ** .7
    tail = np.linspace(0, 1, n - na); e[na:] = (1 - tail) ** shape; return e
def fade(x, i=.004, o=.03):
    n, m = int(i * SR), int(o * SR); x = x.copy()
    if n: x[:n] *= np.linspace(0, 1, n)
    if m: x[-m:] *= np.linspace(1, 0, m)
    return x
def noise(d): return rng.standard_normal(int(d * SR))
def contour(d, pts):  # piecewise linear curve over time, pts = [(t_share, value), ...]
    t = np.linspace(0, 1, int(d * SR)); a = np.array(pts); return np.interp(t, a[:, 0], a[:, 1])
def harm(f, k=30, roll=1.3, jitter=0.0):
    """band-limited buzz with a frequency curve f (Hz per sample)"""
    if jitter: f = f * (1 + jitter * filt(rng.standard_normal(len(f)), 'lowpass', 40) * 3)
    ph = 2 * np.pi * np.cumsum(f) / SR; y = np.zeros(len(f))
    for i in range(1, k + 1):
        m = (f * i < SR * .45).astype(float); y += m * np.sin(i * ph) / i ** roll
    return y
def resonate(x, fc, bw):
    r = np.exp(-np.pi * bw / SR); th = 2 * np.pi * fc / SR
    return lfilter([1 - r], [1, -2 * r * np.cos(th), r * r], x)
def formants(x, F):  # F = [(Hz, bandwidth, gain), ...]
    return sum(g * resonate(x, f, b) for f, b, g in F)
def norm(x, peak=.85): return x * peak / (np.abs(x).max() + 1e-12)
def rms_to(x, db): return x * (10 ** (db / 20) / (np.sqrt((x ** 2).mean()) + 1e-12))
def mix(n, *parts):  # parts = (start s, signal)
    y = np.zeros(n)
    for s, p in parts:
        a = int(s * SR); b = min(n, a + len(p)); y[a:b] += p[:b - a]
    return y
def pitch(x, f): return resample_poly(x, 100, int(round(100 / f)))  # f > 1 = higher + shorter
_ir = {}
def reverb(x, rt=1.8, pre=.05, damp=2500, wet=.6, dry=.4):
    """outdoor-ish hall: predelay + exponentially decaying noise that gets darker over time"""
    key = (rt, pre, damp)
    if key not in _ir:
        t = T(rt * 1.3); n = rng.standard_normal(len(t)); dec = np.exp(-6.9 * t / rt)
        bright = filt(n, 'lowpass', damp * 1.6) * np.exp(-6.9 * t / (rt * .35)); dark = filt(n, 'lowpass', damp * .5) * dec
        ir = np.concatenate([np.zeros(int(pre * SR)), (bright * .6 + dark) * dec ** .3]); _ir[key] = ir / np.sqrt((ir ** 2).sum())
    w = fftconvolve(x, _ir[key])[:len(x) + len(_ir[key])]
    y = np.zeros(len(w)); y[:len(x)] = x * dry; return y + w * wet
def trim(x, db=-60):
    a = np.abs(x); idx = np.where(a > a.max() * 10 ** (db / 20))[0]; return x[:idx[-1] + 1] if len(idx) else x
def save(name, x, peak=.85):
    x = fade(trim(norm(filt(x, 'highpass', 45), peak)), .002, .04)
    sf.write(f'{dst}/{name}.wav', x.astype(np.float32), SR, subtype='PCM_16'); print(name, round(len(x) / SR, 2), 's')

def load(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64)
RAC = load('sfx/animals/racoon_aggro.wav')
def rac(a, b): return fade(RAC[int(a * SR):int(b * SR)].copy(), .005, .03)

# ---------------- building blocks ----------------
def thump(f0=75, d=.22, click=.5):
    """foot / body on the ground: falling sine + muffled dirt click"""
    t = T(d); f = f0 * (1 + 1.2 * np.exp(-t / .012)); y = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(t), .002, 0, 3)
    c = filt(noise(.03), 'lowpass', 900) * env(int(.03 * SR), .001, 0, 2) * click
    return mix(len(t), (0, y), (0, c))
def rustle(d=1.5, swell=True, density=60, lo=1800, hi=6500):
    """bushes being pushed through: band noise + many tiny leaf crackles"""
    n = int(d * SR); bed = filt(noise(d), 'bandpass', [lo, hi]) * .25
    mod = filt(rng.standard_normal(n), 'lowpass', 6); mod = np.clip(.5 + mod / (np.abs(mod).max() + 1e-9), 0, 1)
    y = bed * mod
    for _ in range(int(density * d)):
        s = rng.uniform(0, d - .05); g = filt(noise(.02), 'bandpass', [rng.uniform(2000, 4000), 7500]) * env(int(.02 * SR), .001, 0, 3)
        y = mix(n, (0, y), (s, g * rng.uniform(.2, .8)))
    if swell: y *= contour(d, [(0, 0), (.55, 1), (1, .15)])
    return y
def squeal(d, f_pts, k=14, roll=1.2, jit=.02, vib=(0, 0), F=None, breath=.15, rough=0.0, a=.01, shape=1.6):
    """animal cry: harmonic buzz along a pitch curve through formants, plus breath noise"""
    f = contour(d, f_pts)
    if vib[0]: f = f * (1 + vib[1] * np.sin(2 * np.pi * vib[0] * T(d)))
    y = harm(f, k, roll, jit)
    if rough: y *= 1 - rough * (.5 + .5 * np.sign(np.sin(2 * np.pi * rng.uniform(45, 70) * T(d))))
    if F: y = formants(y, F)
    y = norm(y, 1) + filt(noise(d), 'bandpass', [2500, 8000]) * breath
    return y * env(len(y), a, 0, shape)
def voice(d, f_pts, F, breath=.12, a=.015, shape=1.4, jit=.015):
    """cartoon grunt (oof / hah): glottal buzz through vowel formants"""
    f = contour(d, f_pts); y = formants(harm(f, 40, 1.6, jit), F)
    y = norm(y, 1) + formants(noise(d), F[:2]) * breath * 1.2
    return y * env(len(y), a, 0, shape)
def swish(d=.28, f1=700, f2=3800, a=.35):
    """swing through the air: band noise sweeping up then down"""
    n = int(d * SR); x = noise(d); y = np.zeros(n); fc = contour(d, [(0, f1), (a, f2), (1, f1 * 1.3)])
    for i in range(0, n, 256):  # block-wise sweep
        seg = x[max(0, i - 512):i + 256]; o = filt(seg, 'bandpass', [fc[i] * .6, min(fc[i] * 1.6, 15000)])
        y[i:i + 256] = o[-len(y[i:i + 256]):]
    return y * contour(d, [(0, 0), (a, 1), (1, 0)]) ** 1.5
def distant(x, lp=2200):  # far away: dull, then a lot of hall
    return filt(filt(x, 'lowpass', lp, 4), 'highpass', 90)

# ---------------- night wave: danger coming from afar ----------------
# hares drum the alarm with their hind feet, bushes rustle, a raccoon chorus screeches; all far off with a long hall
CHORUS = [[(35.60, 35.90), (36.34, 36.62), (36.74, 37.34)], [(43.12, 43.38), (43.48, 43.72), (43.84, 44.04)], [(48.32, 48.56), (48.80, 49.04), (27.04, 27.54)]]
for v in range(3):
    d = 4.2; n = int(d * SR); parts = []
    for i in range(3 + v % 2):  # hare drumming: a few quick thumps, then a gap, then again
        t0 = .05 + i * rng.uniform(.17, .22); parts.append((t0, thump(rng.uniform(62, 78), .25) * .9))
    for i in range(3):
        t0 = 1.3 + i * rng.uniform(.15, .2); parts.append((t0, thump(rng.uniform(58, 70), .25) * .75))
    parts.append((.4, rustle(2.6) * .55))
    off = 1.0 + .25 * v
    for j, (a, b) in enumerate(CHORUS[v]):
        p = rng.uniform(.82, .95) if j % 2 else rng.uniform(.95, 1.05)
        parts.append((off + j * rng.uniform(.38, .5), pitch(rac(a, b), p) * .55))
        parts.append((off + .2 + j * .45, pitch(rac(a, b), p * .8) * .22))  # a second raccoon further behind
    x = distant(mix(n, *parts), 2000 + 300 * v)
    save(f'wave_far_{v + 1}', reverb(x, rt=2.4, pre=.07, damp=2200, wet=.85, dry=.35))

# ---------------- raccoon ----------------
# hurt: one sharp screech from the recording, a little higher and squeezed + a quick body thud
for i, (a, b, p) in enumerate([(0.78, 1.00, 1.08), (1.56, 1.78, 1.15), (15.48, 15.72, 1.05), (43.84, 44.04, 1.12)], 1):
    s = pitch(rac(a, b), p); n = len(s) + int(.12 * SR)
    save(f'rac_hurt_{i}', mix(n, (0, thump(110, .12, .8) * .35), (.012, s)))
# bite: snapping jaws (two dry clacks) + short teeth click
for i in range(3):
    n = int(.16 * SR); parts = []
    for j, tt in enumerate([0, rng.uniform(.045, .065)]):
        c = filt(noise(.012), 'bandpass', [rng.uniform(1800, 2600), 9000]) * env(int(.012 * SR), .0005, 0, 4)
        b = np.sin(2 * np.pi * rng.uniform(700, 900) * T(.03)) * env(int(.03 * SR), .0005, 0, 5) * .4
        parts += [(tt, c * (1 if j else .7)), (tt, b)]
    parts.append((0, filt(noise(.08), 'bandpass', [400, 1500]) * env(int(.08 * SR), .002, 0, 2) * .15))  # fur/clothes
    save(f'rac_bite_{i + 1}', mix(n, *parts), .7)

# ---------------- hare ----------------
# soft high squeaks (appears / flees)
for i, (f0, f1) in enumerate([(2100, 2700), (1900, 2400), (2300, 2900)], 1):
    d = rng.uniform(.07, .1)
    s = squeal(d, [(0, f0), (.4, f1), (1, f0 * .9)], k=5, roll=2, jit=.01, breath=.05, a=.008, shape=1.2)
    s2 = squeal(d * .8, [(0, f0 * 1.05), (.5, f1 * 1.04), (1, f0 * .95)], k=5, roll=2, breath=.05, a=.006) * .6
    save(f'hare_squeak_{i}', mix(int((d * 2 + .1) * SR), (0, s), (d + .04, s2)), .55)
# hurt: piercing, child-like scream with fast wobble (real hares scream when caught)
HF = [(1600, 400, 1), (3200, 600, .6), (5200, 900, .25)]
for i, (f0, top, d) in enumerate([(1300, 1900, .42), (1450, 2100, .36), (1200, 1750, .5)], 1):
    s = squeal(d, [(0, f0), (.18, top), (.65, top * .92), (1, f0 * .8)], k=10, roll=1.1, jit=.03, vib=(28, .025), F=HF, breath=.15, a=.012, shape=1.1)
    save(f'hare_hurt_{i}', mix(len(s) + int(.12 * SR), (0, thump(130, .1, .6) * .3), (.01, s)))
# driven off: longer scream falling away
for i, (f0, top) in enumerate([(1250, 1850), (1350, 2000)], 1):
    d = .75; s = squeal(d, [(0, f0), (.12, top), (.4, top * .95), (1, f0 * .55)], k=10, roll=1.1, jit=.035, vib=(26, .03), F=HF, breath=.25, a=.01, shape=1.3)
    save(f'hare_die_{i}', s)
# attack: angry grunting honks + a warning foot thump before it gnaws a field
for i in range(3):
    n = int(.65 * SR); parts = [(0, thump(rng.uniform(66, 80), .25) * .9)]
    for j in range(rng.integers(2, 4)):
        d = rng.uniform(.06, .09); f0 = rng.uniform(330, 420)
        g = squeal(d, [(0, f0), (.5, f0 * 1.15), (1, f0 * .85)], k=24, roll=1.0, jit=.05, F=[(900, 300, 1), (2400, 500, .5)], breath=.4, rough=.6, a=.004, shape=1)
        parts.append((.2 + j * rng.uniform(.11, .14), g * .7))
    save(f'hare_attack_{i + 1}', mix(n, *parts), .75)

# ---------------- player ----------------
# hurt: cartoon "oof" (vowel u/o, falling) over a body thud
for i, (f0, F1, F2) in enumerate([(240, 420, 820), (210, 460, 900), (270, 400, 780), (225, 500, 950)], 1):
    d = rng.uniform(.2, .26)
    v = voice(d, [(0, f0 * 1.15), (.25, f0), (1, f0 * .72)], [(F1, 90, 1), (F2, 120, .5), (2600, 200, .12)], breath=.1, a=.01)
    save(f'player_hurt_{i}', mix(len(v) + int(.1 * SR), (0, thump(95, .16, .9) * .55), (.015, v * .9)), .8)
# attack effort: short "hah" (open a), not every swing (chance in sounds.yaml)
for i, (f0, F1, F2) in enumerate([(260, 750, 1250), (230, 700, 1150), (290, 800, 1300), (250, 680, 1100)], 1):
    d = rng.uniform(.1, .14)
    v = voice(d, [(0, f0 * .95), (.3, f0 * 1.05), (1, f0 * .85)], [(F1, 110, 1), (F2, 140, .6), (2700, 220, .15)], breath=.25, a=.006, shape=1.6)
    save(f'player_effort_{i}', v, .6)
# swing: whoosh of the rake through the air
for i in range(3):
    save(f'swing_{i + 1}', swish(rng.uniform(.22, .3), rng.uniform(500, 800), rng.uniform(3000, 4500), rng.uniform(.3, .42)), .6)
# impact: rake / pellet hits an animal (soft thwack on fur)
for i in range(3):
    n = int(.2 * SR); sm = filt(noise(.04), 'bandpass', [rng.uniform(900, 1300), 3500]) * env(int(.04 * SR), .001, 0, 3)
    save(f'hit_thwack_{i + 1}', mix(n, (0, thump(rng.uniform(100, 130), .16, .4)), (0, sm * .6)), .8)
