"""Gießkannen-Sounds (21.11.2026) aus vier Freesound-Aufnahmen schneiden.
python3 tools/build-can.py <ordner mit den Rohdateien> <ausgabe = public/audio>
Rohdateien (beliebiges Format, per ffmpeg gelesen): 625061 nokta, 488401 wobesound, 711528 nox_sound, 406558 anthousai.
"""
import sys, glob, subprocess, numpy as np, soundfile as sf
from scipy.signal import resample_poly, butter, sosfilt
SR = 44100
src, dst = sys.argv[1], sys.argv[2]
def load(num):
    f = glob.glob(f'{src}/*{num}__*')[0]
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', f, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64)
def cut(x, a, d): return x[int(a * SR):int((a + d) * SR)].copy()
def pitch(x, f):  # f < 1 = tiefer und länger (wie langsamer abspielen)
    up, down = 100, int(round(100 * f)); return resample_poly(x, up, down)
def filt(x, kind, hz, order=4): return sosfilt(butter(order, hz, kind, fs=SR, output='sos'), x)
def fade(x, i, o):
    n, m = int(i * SR), int(o * SR); x[:n] *= np.linspace(0, 1, n) ** 2 if n else 1; x[len(x) - m:] *= np.linspace(1, 0, m) ** 2; return x
def rms_to(x, db): return x * (10 ** (db / 20) / (np.sqrt((x ** 2).mean()) + 1e-12))
def save(name, x):
    p = np.abs(x).max()
    if p > .89: x = x * .89 / p
    sf.write(f'{dst}/{name}.wav', x.astype(np.float32), SR, subtype='PCM_16'); print(name, round(len(x) / SR, 2), 's')
nokta, wobe, nox, ant = load('625061'), load('488401'), load('711528'), load('406558')
# Gießen: gleichmäßiges Plätschern aus 1 (nokta), gut 1 Halbton tiefer; 2 (wobesound) ist schrill -> nur tiefpassgefiltert, leise darunter für Fülle
for i, a in enumerate([3.0, 6.6, 10.2], 1):
    A = filt(pitch(cut(nokta, a, 2.3), .93), 'highpass', 120)
    B = filt(filt(pitch(cut(wobe, a + 2, 2.3), .92), 'lowpass', 3500), 'highpass', 150)
    n = int(2.3 * SR); A, B = A[:n], B[:n]
    save(f'can_pour_{i}', fade(rms_to(A, -20) + rms_to(B, -20) * .3, .12, .35))
# Kanne füllen: einzelne Wasser-Schwapper aus 3 (nox_sound), je ~1,2 s, gleich laut
for i, a in enumerate([2.0, 4.1, 6.1, 8.0, 9.8, 14.65, 16.8, 19.1, 21.1], 1):
    save(f'can_fill_{i}', fade(rms_to(filt(cut(nox, a, 1.25), 'highpass', 80), -22), .005, .3))
# Kanne leer: metallisches Schnippen aus 4 (anthousai); das zweite, tiefere spielt sounds.yaml mit pitch + delay
save('can_empty', fade(rms_to(cut(ant, 0, 1.3), -26), .002, .5))
