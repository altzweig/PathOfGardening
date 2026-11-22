# soft look: supersample down, light softening, Orton glow, depth blur top/bottom, mood grade, vignette
import sys, numpy as np
from PIL import Image, ImageFilter
src, dst, W, H, mood = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5]
night = mood == 'nacht'
im = Image.open(src).convert('RGB').resize((W, H), Image.LANCZOS)
a = np.asarray(im).astype(np.float32) / 255
def blur(arr, r):
    return np.asarray(Image.fromarray((arr * 255).clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))).astype(np.float32) / 255
s = max(W, H) / 1920
a = a ** {'nacht': .86, 'morgen': .95}.get(mood, 1.0)        # lift the dark night ground a little
a = a * .6 + blur(a, 1.2 * s) * .4                       # softening
b = blur(a, 16 * s)                                        # Orton glow
thr, k = {'nacht': (.22, .75), 'abend': (.35, .45), 'morgen': (.35, .42)}.get(mood, (.45, .3))
glow = np.clip((b - thr) / (1 - thr), 0, 1) * b
a = 1 - (1 - a) * (1 - glow * k)
y = np.linspace(0, 1, H)[:, None, None]                    # depth blur: far (top) + nearest foreground (bottom)
top = .45 if W > H else .38
m = np.clip((top - y) / top, 0, 1) ** 1.3 * .95 + np.clip((y - .85) / .15, 0, 1) ** 1.5 * .7
a = a * (1 - m) + blur(a, 6 * s) * m
lum = (a * [.299, .587, .114]).sum(2, keepdims=True)
G = {  # shadows tint, highlights tint, saturation, lift
  'morgen': ([.98, .96, 1.04], [1.07, 1.0, .9], 1.04, .04),
  'mittag': ([.97, 1.0, 1.03], [1.03, 1.01, .96], 1.12, .02),
  'abend':  ([1.0, .93, .92], [1.14, .99, .8], 1.08, .035),
  'nacht':  ([.9, .97, 1.12], [1.06, 1.0, .92], 1.05, .015),
}[mood]
w = np.clip(lum * 1.4, 0, 1)
a = a * (np.array(G[0]) * (1 - w) + np.array(G[1]) * w)
lum = (a * [.299, .587, .114]).sum(2, keepdims=True)
a = lum + (a - lum) * G[2]
a = G[3] + a * (1 - G[3])
yy, xx = np.mgrid[0:H, 0:W]
r = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2) / np.sqrt(2)
a *= (1 - .25 * np.clip((r - .45) / .55, 0, 1) ** 1.6)[..., None]
Image.fromarray((a.clip(0, 1) * 255 + .5).astype(np.uint8)).save(dst, quality=82, optimize=True, progressive=True)
