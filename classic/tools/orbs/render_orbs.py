"""Renders the PC HUD orbs (HP left, XP right) as static 2D images.

24.11.2026 (Basti): HP und XP wie Path of Exile / Diablo als Kugeln unten links/rechts,
XP goldgelb, milchig-transluzent, polierter Glanz mit Unebenheiten, Rankenrahmen mit Dornen.

Per orb three layers (the game composites them in a canvas, see src/ui/orbs.ts):
  orb-<k>-back.webp   empty glass interior (opaque disc)
  orb-<k>-fill.webp   the liquid as a full sphere (opaque disc), clipped by height in game
  orb-<k>-front.webp  glass reflections + frame of woven branches + thorny vines (transparent)
All geometry is fixed in render space: N x N, glass centre (CX, CY), radius R.
src/ui/orbs.ts uses the same numbers (G).

python3 tools/orbs/render_orbs.py [outdir]   (needs numpy, scipy, pillow)
"""
import json, math, sys
import numpy as np
from scipy import ndimage
from PIL import Image

N = 1024          # render size (downsampled 2x on export)
OUT = 640
CX, CY, R = 512.0, 560.0, 300.0
L = np.array([-0.5, -0.62, 0.6]); L = L / np.linalg.norm(L)   # light from top left (screen y down)

yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
X = (xx - CX) / R; Y = (yy - CY) / R
RR = X * X + Y * Y; RAD = np.sqrt(RR)
DISC = np.clip((1.0 - RAD) * R + 0.5, 0, 1)   # anti-aliased disc
NZ = np.sqrt(np.clip(1 - RR, 0, 1))

def sstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

def vnoise(cell, seed, shape=(N, N)):
    rng = np.random.default_rng(seed)
    gh, gw = shape[0] // cell + 3, shape[1] // cell + 3
    g = rng.random((gh, gw)).astype(np.float32)
    z = ndimage.zoom(g, cell, order=3, mode='wrap')
    return z[:shape[0], :shape[1]]

def fbm(cell, seed, oct=5, shape=(N, N)):
    s, a, tot = 0, 1.0, 0
    for o in range(oct):
        c = max(2, int(cell / 2 ** o))
        s = s + a * vnoise(c, seed + o * 17, shape); tot += a; a *= 0.5
    return s / tot

def lerp(a, b, t):
    t = np.asarray(t)[..., None] if np.ndim(t) else t
    return a + (b - a) * t

C = lambda *v: np.array(v, np.float32)

PAL = {
    'hp': dict(deep=C(.13, .0, .01), mid=C(.62, .02, .04), bright=C(1.0, .30, .22), milk=C(1.0, .66, .62),
               empty=C(.075, .025, .03), tint=C(1.0, .45, .40)),
    'xp': dict(deep=C(.36, .16, .01), mid=C(.88, .56, .08), bright=C(1.0, .88, .46), milk=C(1.0, .96, .82),
               empty=C(.08, .055, .02), tint=C(1.0, .85, .45)),
}

# ---------------------------------------------------------------- liquid + empty glass
def render_fill(k, seed):
    p = PAL[k]
    # domain-warped clouds = milky swirls inside the liquid
    w1 = fbm(180, seed + 1); w2 = fbm(180, seed + 2)
    wx = xx + (w1 - .5) * 160; wy = yy + (w2 - .5) * 160
    cloud = ndimage.map_coordinates(fbm(140, seed + 3), [np.clip(wy, 0, N - 1), np.clip(wx, 0, N - 1)], order=1)
    cloud = sstep(.35, .75, cloud)
    # light transmitted through the sphere gathers lower right of the centre
    core = np.exp(-((X - .16) ** 2 + (Y - .22) ** 2) / .30)
    lam = np.clip(-(X * L[0] + Y * L[1]) + NZ * L[2], 0, 1)
    edge = (1 - NZ) ** 1.6
    s = np.clip(.30 + .55 * core + .25 * lam - .35 * edge, 0, 1)
    col = lerp(p['deep'], p['mid'], np.clip(s * 1.5, 0, 1))
    col = lerp(col, p['bright'], np.clip(core ** 2.2 * 1.1, 0, 1))
    # milkiness: soft pale haze, stronger in the clouds, a bit at the rim (scattering)
    milk = .10 + .22 * cloud * NZ + .16 * sstep(.72, 1.0, RAD) * (1 - sstep(.97, 1.0, RAD))
    col = lerp(col, p['milk'], np.clip(milk, 0, .5))
    col = col * (1 - .45 * edge[..., None])
    rng = np.random.default_rng(seed + 9)
    if k == 'xp':   # suspended golden specks / tiny bubbles like honey
        for _ in range(420):
            a = rng.random() * 2 * math.pi; r = math.sqrt(rng.random()) * .93
            bx, by = CX + math.cos(a) * r * R, CY + math.sin(a) * r * R
            rad = rng.choice([2.2, 3, 4, 5.5, 7.5], p=[.35, .3, .2, .1, .05])
            d = np.hypot(xx[int(by) - 12:int(by) + 12, int(bx) - 12:int(bx) + 12] - bx, yy[int(by) - 12:int(by) + 12, int(bx) - 12:int(bx) + 12] - by)
            m = np.clip(rad - d + .5, 0, 1) * (1 - r * r) ** .5
            sub = col[int(by) - 12:int(by) + 12, int(bx) - 12:int(bx) + 12]
            if rng.random() < .25:
                sub[:] = lerp(sub, C(.55, .3, .02), m * .55)
            else:
                hl = np.clip(1 - np.hypot(xx[int(by) - 12:int(by) + 12, int(bx) - 12:int(bx) + 12] - bx + rad * .35,
                                          yy[int(by) - 12:int(by) + 12, int(bx) - 12:int(bx) + 12] - by + rad * .35) / (rad * .55), 0, 1)
                sub[:] = lerp(sub, C(1, .93, .6), m * .55)
                sub[:] = lerp(sub, C(1, 1, .95), hl * m * .8)
    else:           # a few darker veins of blood in the red
        vein = sstep(.48, .52, fbm(90, seed + 21)) * (1 - sstep(.52, .58, fbm(90, seed + 21)))
        col = lerp(col, p['deep'] * 1.4, ndimage.gaussian_filter(vein, 2) * .14 * NZ)
    return np.clip(col, 0, 1)

def render_empty(k, seed):
    p = PAL[k]
    core = np.exp(-((X - .2) ** 2 + (Y - .35) ** 2) / .25)
    col = p['empty'] * (0.55 + .9 * core[..., None]) * (1 - .55 * (1 - NZ[..., None]) ** 1.2)
    smoke = fbm(160, seed + 40)
    col = col * (.85 + .35 * smoke[..., None])
    return np.clip(col, 0, 1)

# ---------------------------------------------------------------- glass surface (front)
def render_glass(k, seed):
    p = PAL[k]
    rgb = np.zeros((N, N, 3), np.float32); a = np.zeros((N, N), np.float32)
    def over(c, al):
        nonlocal rgb, a
        al = np.clip(al, 0, 1)
        rgb = lerp(rgb * a[..., None], np.broadcast_to(c, rgb.shape), al) ; a2 = a + al * (1 - a)
        rgb = np.where(a2[..., None] > 1e-5, rgb / np.maximum(a2, 1e-5)[..., None], 0); a = a2
    # uneven glass: perturb the normal with low frequency noise
    n1 = (fbm(70, seed + 50) - .5) * .16; n2 = (fbm(70, seed + 51) - .5) * .16
    nx, ny = X + n1, Y + n2; nz = np.sqrt(np.clip(1 - nx * nx - ny * ny, 0, 1))
    # reflect the view vector (0,0,1): r = 2 n.z n - v
    rx, ry, rz = 2 * nz * nx, 2 * nz * ny, 2 * nz * nz - 1
    rdl = np.clip(rx * L[0] + ry * L[1] + rz * L[2], 0, 1)
    inside = DISC
    # inner shadow under the frame (stronger at the top)
    over(C(0, 0, 0), sstep(.80, 1.0, RAD) * (.55 + .25 * np.clip(-Y, 0, 1)) * inside)
    # light passing through, gathering as a soft crescent lower right
    cres = np.exp(-((RAD - .78) / .13) ** 2) * np.clip(X * .45 + Y * .9, 0, 1) ** 1.5
    over(p['tint'], cres * .30 * inside)
    # fresnel rim
    over(C(.85, .9, 1), (1 - NZ) ** 2.5 * .22 * inside)
    # broad soft sheen + hot spot (window shaped, a bit wobbly from the unevenness)
    over(C(1, 1, 1), rdl ** 7 * .22 * inside)
    win = sstep(.93, .975, rdl) * .42 + rdl ** 160 * .45
    over(C(1, 1, .97), win * inside)
    # sharp reflection band along the upper left rim
    band = np.exp(-((RAD - .87) / .045) ** 2) * sstep(.1, .7, -(X * .55 + Y * .83)) * (.7 + .3 * fbm(40, seed + 52))
    over(C(1, 1, 1), band * .55 * inside)
    # small secondary highlight lower right
    s2 = np.exp(-(((X - .52) / .07) ** 2 + ((Y - .55) / .05) ** 2))
    over(C(1, 1, 1), s2 * .35 * inside)
    # faint smudges / micro scratches on the glass
    sm = sstep(.62, .8, fbm(22, seed + 53)) * .05 + sstep(.8, .9, vnoise(3, seed + 54)) * .03
    over(C(1, 1, 1), sm * inside * (.4 + rdl))
    return rgb, a

# ---------------------------------------------------------------- 2.5D frame + vines (height field)
class HF:
    def __init__(s):
        s.h = np.full((N, N), -1e4, np.float32)
        s.mat = np.zeros((N, N), np.int8); s.t = np.zeros((N, N), np.float32); s.v = np.zeros((N, N), np.float32)
        s.cov = np.zeros((N, N), np.float32)   # anti-aliasing coverage
    def put(s, y0, y1, x0, x1, h, m, mat, t, v):
        sh = s.h[y0:y1, x0:x1]; win = (h > sh) & (m > 0)
        sh[win] = h[win]; s.mat[y0:y1, x0:x1][win] = mat
        if np.ndim(t): s.t[y0:y1, x0:x1][win] = t[win]
        else: s.t[y0:y1, x0:x1][win] = t
        if np.ndim(v): s.v[y0:y1, x0:x1][win] = v[win]
        else: s.v[y0:y1, x0:x1][win] = v
        cv = s.cov[y0:y1, x0:x1]; np.maximum(cv, m, out=cv)
    def sphere(s, cx, cy, r, z, mat, t, tx=0, ty=0):
        x0, x1 = int(max(0, cx - r - 2)), int(min(N, cx + r + 3)); y0, y1 = int(max(0, cy - r - 2)), int(min(N, cy + r + 3))
        if x0 >= x1 or y0 >= y1: return
        dx = xx[y0:y1, x0:x1] - cx; dy = yy[y0:y1, x0:x1] - cy; d2 = dx * dx + dy * dy
        m = np.clip(r - np.sqrt(d2) + .5, 0, 1)
        h = z + np.sqrt(np.clip(r * r - d2, 0, None))
        v = (dx * -ty + dy * tx) / max(r, 1e-3)    # across the tube, -1..1
        s.put(y0, y1, x0, x1, h, m, mat, t, v)
    def tube(s, pts, rad, z, mat, t0=0.0):
        """pts: (n,2) polyline, rad/z: scalar or (n,) arrays. Swept spheres every ~1.2 px."""
        pts = np.asarray(pts, np.float32); n = len(pts)
        rad = np.broadcast_to(np.asarray(rad, np.float32), (n,)); z = np.broadcast_to(np.asarray(z, np.float32), (n,))
        seg = np.hypot(*np.diff(pts, axis=0).T); cum = np.concatenate([[0], np.cumsum(seg)])
        tot = cum[-1]; m = max(2, int(tot / 1.2))
        u = np.linspace(0, tot, m)
        px = np.interp(u, cum, pts[:, 0]); py = np.interp(u, cum, pts[:, 1]); pr = np.interp(u, cum, rad); pz = np.interp(u, cum, z)
        tx = np.gradient(px); ty = np.gradient(py); tl = np.hypot(tx, ty) + 1e-6; tx /= tl; ty /= tl
        for i in range(m):
            if pr[i] > .4: s.sphere(px[i], py[i], pr[i], pz[i] - pr[i] * .35, mat, t0 + u[i], tx[i], ty[i])
        return px, py, pr, pz, tx, ty, u
    def cone(s, bx, by, dx, dy, length, base, z, mat):
        """thorn: cone lying on the surface, base centre (bx,by), pointing (dx,dy)."""
        l = math.hypot(dx, dy); dx /= l; dy /= l
        ex, ey = bx + dx * length, by + dy * length
        x0, x1 = int(max(0, min(bx, ex) - base - 2)), int(min(N, max(bx, ex) + base + 3))
        y0, y1 = int(max(0, min(by, ey) - base - 2)), int(min(N, max(by, ey) + base + 3))
        if x0 >= x1 or y0 >= y1: return
        qx = xx[y0:y1, x0:x1] - bx; qy = yy[y0:y1, x0:x1] - by
        u = (qx * dx + qy * dy) / length; v = -qx * dy + qy * dx
        w = base * np.clip(1 - u, 0, 1) ** 1.25 * np.clip(u * 4 + 1, 0, 1)   # slightly rounded base, concave flanks
        m = np.clip(w - np.abs(v) + .5, 0, 1) * (u > -.25) * (u < 1)
        h = z + np.sqrt(np.clip(w * w - v * v, 0, None)) * .9
        s.put(y0, y1, x0, x1, h, m, mat, u, v / np.maximum(w, 1e-3))
    def leaf(s, bx, by, dx, dy, length, width, z, mat, bend=.25, tilt=0.0):
        l = math.hypot(dx, dy); dx /= l; dy /= l
        ex, ey = bx + dx * length, by + dy * length
        pad = width + length * abs(bend) + 4
        x0, x1 = int(max(0, min(bx, ex) - pad)), int(min(N, max(bx, ex) + pad))
        y0, y1 = int(max(0, min(by, ey) - pad)), int(min(N, max(by, ey) + pad))
        if x0 >= x1 or y0 >= y1: return
        qx = xx[y0:y1, x0:x1] - bx; qy = yy[y0:y1, x0:x1] - by
        u = (qx * dx + qy * dy) / length; v = -qx * dy + qy * dx
        v = v - bend * length * (u * u - u) * -1   # curved midrib
        uu = np.clip(u, 0, 1)
        w = width * np.clip(np.sin(np.pi * uu), 0, 1) ** .75 * (1 - .35 * uu) * (u > 0) * (u < 1)
        m = np.clip(w - np.abs(v) + .5, 0, 1)
        vv = v / np.maximum(w, 1e-3)
        dome = (1 - vv * vv) * width * .45 * np.clip(np.sin(np.pi * uu), 0, 1) ** .6
        h = z + dome + tilt * (u - .5) * length * .3 - np.exp(-(vv / .07) ** 2) * width * .08   # groove along the midrib
        s.put(y0, y1, x0, x1, h, m, mat, u, vv)

WOOD, BASE, VINE, THORN, LEAF, TENDRIL = 1, 2, 3, 4, 5, 6

def build_frame(seed, side):
    """side = -1: HP (vines heavier on the left), +1: XP (mirror)."""
    rng = np.random.default_rng(seed)
    hf = HF()
    RF = R + 24
    sx = lambda ang: CX + 0  # placeholder
    def P(theta, rad):   # polar -> screen, mirrored for side
        return CX + side * -math.cos(theta) * rad, CY + math.sin(theta) * rad
    # dark socket ring under everything
    th = np.linspace(0, 2 * math.pi, 900)
    pts = np.array([P(a, RF) for a in th]); hf.tube(pts, 30, -10, BASE)
    # three woven branches around the ring
    for k in range(3):
        ph = k * 2 * math.pi / 3
        rads = RF + 11 * np.sin(4 * th + ph) + 2 * np.sin(13 * th + k)
        zs = 18 + 9 * np.cos(4 * th + ph)
        pts = np.array([P(a, r) for a, r in zip(th, rads)])
        hf.tube(pts, 12.5 + 1.5 * np.sin(7 * th + k * 2), zs, WOOD, t0=k * 900)
    # thorny vines: theta measured from the outer side (0 = outer middle), positive = up
    def vine(a0, a1, rad0, rad1, z0, wraps, phase, cover, seedv, leaves=4, tendril=True, lead=None):
        r2 = np.random.default_rng(seedv)
        n = 700
        a = np.linspace(a0, a1, n)
        f = np.linspace(0, 1, n)
        phi = wraps * 2 * math.pi * f + phase
        radial = RF + 30 * np.cos(phi) + cover * np.exp(-((a - (a0 + a1) / 2) / .9) ** 2)
        zz = z0 + 26 * np.sin(phi)
        thick = rad0 + (rad1 - rad0) * f ** .8
        pts = [P(math.pi + aa, rr) for aa, rr in zip(a, radial)]
        if lead is not None: pts = list(lead) + pts; thick = np.concatenate([np.full(len(lead), rad0), thick]); zz = np.concatenate([np.full(len(lead), z0 + 10), zz])
        pts = np.array(pts)
        px, py, pr, pz, tx, ty, u = hf.tube(pts, thick, zz, VINE, t0=seedv * 37 % 500)
        # thorns
        step = 34; sgn = 1
        for i in range(int(20 + r2.random() * 10), len(px), int(step / 1.2)):
            sgn = -sgn
            if pr[i] < 3.5: continue
            nx, ny = -ty[i] * sgn, tx[i] * sgn
            bx, by = px[i] + nx * pr[i] * .6, py[i] + ny * pr[i] * .6
            dx, dy = nx * .85 - tx[i] * .5, ny * .85 - ty[i] * .5
            hf.cone(bx, by, dx, dy, pr[i] * (2.1 + r2.random() * .7), pr[i] * .7, pz[i] + pr[i] * .2, THORN)
        # leaves
        for j in range(leaves):
            i = int((j + .5 + r2.random() * .4) / leaves * len(px)) % len(px)
            sg = r2.choice([-1, 1]); nx, ny = -ty[i] * sg, tx[i] * sg
            dx, dy = nx + tx[i] * (.4 + r2.random() * .6), ny + ty[i] * (.4 + r2.random() * .6)
            hf.leaf(px[i], py[i], dx, dy, 62 + r2.random() * 34, 21 + r2.random() * 8, pz[i] + 6, LEAF, bend=r2.uniform(-.35, .35), tilt=r2.uniform(-1, 1))
        if tendril:   # curly tendril at the tip
            i = len(px) - 1; ang = math.atan2(ty[i], tx[i]); cx, cy = px[i], py[i]; tp = []
            for q in range(160):
                rr = 16 * (1 - q / 190); ang += .085 * (1 + q / 60)
                cx += math.cos(ang) * 1.1; cy += math.sin(ang) * 1.1; tp.append((cx, cy))
            hf.tube(np.array(tp), np.linspace(pr[-1] * .9, .8, len(tp)), pz[-1], TENDRIL)
        return px, py
    # main trunk climbing from below the image edge into the ring on the outer side
    def lead_to(a, rad, z):
        ex, ey = P(math.pi + a, rad)
        sx_, sy_ = CX + side * (RF + 40), N + 40
        c1 = (CX + side * (RF + 95), CY + R * .9)
        pts = []
        for q in range(140):
            f = q / 139
            pts.append(((1 - f) ** 2 * sx_ + 2 * f * (1 - f) * c1[0] + f * f * ex, (1 - f) ** 2 * sy_ + 2 * f * (1 - f) * c1[1] + f * f * ey))
        return pts[:-1]
    a0, ph0 = -.75, .4
    vine(a0, 1.75, 16, 4.5, 34, 2.4, ph0, 8, seed + 1, leaves=7, lead=lead_to(a0, RF + 30 * math.cos(ph0) + 8 * math.exp(-((a0 - .5) / .9) ** 2), 34))
    a1, ph1 = -.95, 2.2
    vine(a1, 1.1, 11, 3.2, 30, 2.6, ph1, 14, seed + 2, leaves=5, lead=lead_to(a1, RF + 30 * math.cos(ph1), 30))
    vine(1.2, 2.9, 7, 2.6, 30, 1.6, 4.0, 0, seed + 3, leaves=3)
    vine(-1.0, -2.3, 7, 2.4, 30, 1.3, 1.0, 0, seed + 4, leaves=2)
    # big leaves overlapping the glass on the outer edge
    r3 = np.random.default_rng(seed + 7)
    for j, (aa, ln, wd) in enumerate([(.1, 150, 46), (-.3, 130, 40), (.42, 125, 38), (-.62, 105, 32), (.75, 100, 30)]):
        bx, by = P(math.pi + aa, RF + 30)
        tx_, ty_ = P(math.pi + aa, RF - 120)
        hf.leaf(bx, by, tx_ - bx + r3.uniform(-30, 30), ty_ - by + r3.uniform(-40, 40), ln, wd, 58 + j * 3, LEAF, bend=r3.uniform(-.3, .3), tilt=.8)
    return hf

def shade(hf, seed):
    m = hf.cov > 0
    h = np.where(hf.h > -1e3, hf.h, ndimage.grey_dilation(np.where(hf.h > -1e3, hf.h, -50), size=3))
    h = np.where(hf.h > -1e3, hf.h, -40.0).astype(np.float32)
    hs = ndimage.gaussian_filter(h, .8)
    gx = ndimage.sobel(hs, 1) / 8; gy = ndimage.sobel(hs, 0) / 8
    # surface texture as tiny bumps per material
    t, v, mat = hf.t, hf.v, hf.mat
    bark = fbm(10, seed + 60)
    bump = np.zeros_like(h)
    bump += (mat == WOOD) * (np.sin(t * .35 + bark * 8) * .5 + (bark - .5) * 2.5)
    bump += (mat == LEAF) * (np.abs(np.sin(t * 18 + v * 3)) < .18) * -.6
    bump += (mat == VINE) * np.sin(v * 3 + t * .05) * .3
    gx += ndimage.sobel(bump, 1) / 8; gy += ndimage.sobel(bump, 0) / 8
    n = np.dstack([-gx, -gy, np.ones_like(gx)]); n /= np.linalg.norm(n, axis=2, keepdims=True)
    ndl = n @ L
    Hv = L + np.array([0, 0, 1.0]); Hv /= np.linalg.norm(Hv)
    ndh = np.clip(n @ Hv, 0, 1)
    # cast shadows by marching the height field towards the light
    sh = np.ones_like(h); ldir = -L[:2] / np.linalg.norm(L[:2]); slope = L[2] / np.linalg.norm(L[:2])
    for k in range(2, 60, 2):
        dx, dy = ldir * k * -1
        sm = ndimage.shift(h, (dy, dx), order=0, mode='nearest', cval=-50)
        sh = np.minimum(sh, np.clip(1 - (sm - (h + k * slope)) / 6, 0, 1))
    sh = ndimage.gaussian_filter(sh, 1.2)
    ao = np.clip(1 - (ndimage.gaussian_filter(h, 10) - h) * .025, .35, 1) * np.clip(1 - (ndimage.gaussian_filter(h, 3) - h) * .05, .4, 1)
    # albedo per material
    alb = np.zeros((N, N, 3), np.float32); gloss = np.zeros((N, N), np.float32); sp = np.zeros((N, N), np.float32)
    wood = lerp(C(.20, .12, .07), C(.47, .32, .19), np.clip(.5 + .5 * np.sin(t * .35 + bark * 8) * .6 + (bark - .5), 0, 1))
    sel = mat == WOOD; alb[sel] = wood[sel]; gloss[sel] = 18; sp[sel] = .12
    sel = mat == BASE; alb[sel] = C(.10, .06, .04); gloss[sel] = 8; sp[sel] = .05
    streak = np.clip(.5 + .5 * np.sin(v * 2.2 + np.sin(t * .03) * 1.5), 0, 1)
    vine = lerp(C(.13, .32, .06), C(.45, .68, .14), np.clip(.35 + .65 * streak * (.7 + .6 * fbm(16, seed + 61)), 0, 1))
    sel = (mat == VINE) | (mat == TENDRIL); alb[sel] = vine[sel]; gloss[sel] = 40; sp[sel] = .28
    thorn = lerp(C(.30, .45, .16), C(.86, .87, .77), sstep(.0, .45, t))
    sel = mat == THORN; alb[sel] = thorn[sel]; gloss[sel] = 60; sp[sel] = .45
    veins = (np.abs(v) < .06) | (np.abs(np.sin((t - np.abs(v) * .45) * 22)) < .12) * (np.abs(v) < .9)
    leafc = lerp(C(.08, .25, .05), C(.32, .55, .10), np.clip(.55 + .45 * (1 - np.abs(v)) * (.6 + .5 * fbm(20, seed + 62)) - .25 * t, 0, 1))
    leafc = np.where(veins[..., None], leafc * .72 + C(.05, .07, .0), leafc)
    sel = mat == LEAF; alb[sel] = leafc[sel]; gloss[sel] = 30; sp[sel] = .22
    diff = np.clip(ndl, 0, 1) * sh * .95 + .24 + .12 * np.clip(n[..., 2], 0, 1)
    col = alb * (diff * ao)[..., None] + (ndh ** gloss * sp * sh)[..., None] * C(1, 1, .92)
    # rim light from below right, keeps dark silhouettes readable
    col += (np.clip(n[..., 0] * .6 + n[..., 1] * .8, 0, 1) ** 3 * .10)[..., None] * C(.9, .95, .7)
    alpha = np.clip(hf.cov, 0, 1)
    return np.clip(col, 0, 1), alpha

def comp(dst_rgb, dst_a, src_rgb, src_a):
    a = src_a + dst_a * (1 - src_a)
    rgb = (src_rgb * src_a[..., None] + dst_rgb * (dst_a * (1 - src_a))[..., None]) / np.maximum(a, 1e-5)[..., None]
    return rgb, a

def save(rgb, a, path):
    img = np.dstack([np.clip(rgb, 0, 1), np.clip(a, 0, 1)])
    # premultiply for the resize, then un-premultiply
    pm = img.copy(); pm[..., :3] *= pm[..., 3:4]
    im = Image.fromarray((pm * 255 + .5).astype(np.uint8), 'RGBA').resize((OUT, OUT), Image.LANCZOS)
    arr = np.asarray(im).astype(np.float32) / 255
    al = arr[..., 3:4]; arr[..., :3] = np.where(al > 0, arr[..., :3] / np.maximum(al, 1e-4), 0)
    Image.fromarray((np.clip(arr, 0, 1) * 255 + .5).astype(np.uint8), 'RGBA').save(path, 'WEBP', quality=90, method=6)

def main():
    out = sys.argv[1] if len(sys.argv) > 1 else 'public/hud'
    import os; os.makedirs(out, exist_ok=True)
    for k, side, seed in (('hp', -1, 11), ('xp', 1, 23)):
        save(render_empty(k, seed), DISC, f'{out}/orb-{k}-back.webp')
        save(render_fill(k, seed), DISC, f'{out}/orb-{k}-fill.webp')
        g_rgb, g_a = render_glass(k, seed)
        hf = build_frame(seed, side)
        f_rgb, f_a = shade(hf, seed)
        # drop shadow of frame + vines onto the glass
        sha = ndimage.shift(ndimage.gaussian_filter(f_a, 9), (16, 12), order=1) * .62
        rgb, a = comp(g_rgb, g_a, np.zeros_like(g_rgb), sha)
        rgb, a = comp(rgb, a, f_rgb, f_a)
        save(rgb, a, f'{out}/orb-{k}-front.webp')
        print(k, 'done')

if __name__ == '__main__':
    main()
