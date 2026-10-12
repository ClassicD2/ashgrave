# Procedural "frozen plateau" floor set for Ashgrave (128x64 isometric diamonds).
#
# Materials: snow, ice (frozen lakes/rivers) and rock (wind-scoured ground).
# Transitions use corner tiles (marching squares): each tile corner is snow or <material>, giving 16 tiles
# per material. The edge between two tiles only depends on the two shared corners plus a noise field that
# is periodic in tile space, so every tile meets every neighbour without a seam and lakes can wind
# across the map in any shape.
#
# Tile corner bits: 1 = top corner (u0,v0), 2 = right (u1,v0), 4 = left (u0,v1), 8 = bottom (u1,v1).
import sys, os, numpy as np
from PIL import Image
N = 256
OUT = sys.argv[1] if len(sys.argv) > 1 else 'plateau_out'
os.makedirs(OUT, exist_ok=True)
u = (np.arange(N) + 0.5) / N
U, V = np.meshgrid(u, u, indexing='xy')

def pnoise(seed, scale, power=2.0):
    r = np.random.default_rng(seed)
    f = np.fft.fftfreq(N) * N
    FX, FY = np.meshgrid(f, f)
    k = np.sqrt(FX ** 2 + FY ** 2); k[0, 0] = 1
    spec = np.fft.fft2(r.standard_normal((N, N))) / (k ** power) * np.exp(-(k / scale) ** 2)
    spec[0, 0] = 0
    n = np.real(np.fft.ifft2(spec)); return (n - n.mean()) / (n.std() + 1e-9)

def edge_weight():
    d = np.minimum.reduce([U, 1 - U, V, 1 - V])
    return np.clip((d - 0.06) / 0.16, 0, 1) ** 1.5
W = edge_weight()

def varied(seed_base, seed, parts):
    """Noise shared at the tile edges, own variation inside (so plain tiles do not repeat)."""
    a = sum(w * pnoise(seed_base + i, sc, pw) for i, (w, sc, pw) in enumerate(parts))
    b = sum(w * pnoise(seed_base + 50 + 17 * seed + i, sc, pw) for i, (w, sc, pw) in enumerate(parts))
    return a * (1 - W) + b * W

def blob(cx, cy, rx, ry, rot=0.0):
    x, y = U - cx, V - cy
    c, s = np.cos(rot), np.sin(rot)
    xr, yr = x * c + y * s, -x * s + y * c
    return np.clip(1 - (xr / rx) ** 2 - (yr / ry) ** 2, 0, 1)

def lambert(h, k=9.0):
    hh = h * k
    gx = (np.roll(hh, -1, 1) - np.roll(hh, 1, 1)) / 2; gy = (np.roll(hh, -1, 0) - np.roll(hh, 1, 0)) / 2
    L = np.array([-0.55, -0.35, 0.76]); L /= np.linalg.norm(L)
    nz = 1 / np.sqrt(gx ** 2 + gy ** 2 + 1)
    return np.clip((-gx * L[0] - gy * L[1] + L[2]) * nz, 0, 1)

def mix(a, b, t): return a * (1 - t[..., None]) + b * t[..., None]
def sstep(e0, e1, x): t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)

# ---- materials (each returns colour field and height) -----------------------
def snow(seed):
    h = varied(10, seed, [(0.55, 40, 1.6), (0.3, 90, 1.2), (0.12, 200, 0.8)]) * 0.16
    h += 0.012 * np.sin(2 * np.pi * (7 * (U + 0.35 * V) + 0.12 * pnoise(900, 20, 1.8))) * (0.6 + 0.4 * pnoise(901, 15, 1.5))
    lam = lambert(h)
    col = mix(np.array([92, 108, 140.]), np.array([222, 228, 236.]), lam) * 0.8 + np.array([168, 178, 196.]) * 0.2
    r = np.random.default_rng(700 + seed); sp = (r.random((N, N)) < 0.004) & (lam > 0.7)
    col[sp] = np.minimum(255, col[sp] + 45)
    return col, h

def ice(seed):
    # dark clear ice with depth variation, white crack network, frost and wind-blown snow streaks
    depth = varied(30, seed, [(0.5, 30, 1.6), (0.5, 80, 1.0)])
    col = mix(np.array([54, 84, 112.]), np.array([72, 104, 132.]), sstep(-2.5, 2.5, depth))
    n1 = varied(40, seed, [(1.0, 70, 1.25)]); n2 = varied(45, seed, [(1.0, 40, 1.3)])
    crack = np.clip(1 - np.abs(n1) / 0.045, 0, 1) * 0.8 + np.clip(1 - np.abs(n2) / 0.03, 0, 1) * 0.45
    col = mix(col, np.array([196, 222, 238.]), np.clip(crack, 0, 0.85))
    bubbles = (varied(48, seed, [(1.0, 120, 0.6)]) > 2.2)
    col[bubbles] = col[bubbles] * 0.7 + np.array([200, 225, 240.]) * 0.3
    streak = np.clip(varied(50, seed, [(1.0, 25, 1.6)]) * 0.5 + 0.4 * np.sin(2 * np.pi * (5 * (U + 0.35 * V) + 0.2 * pnoise(51, 15, 1.6))) - 0.7, 0, 1)
    col = mix(col, np.array([176, 192, 212.]), np.clip(streak * 1.4, 0, 1) * 0.4)
    gl = sstep(0.3, 1.2, varied(55, seed, [(1.0, 10, 2.0)]))  # soft sky sheen
    col = col + gl[..., None] * 14
    return col, np.zeros((N, N)) + streak * 0.01

def rock(seed):
    # wind-scoured dark stone and gravel with snow caught in the hollows
    h = varied(60, seed, [(0.6, 30, 1.7), (0.3, 80, 1.2), (0.25, 200, 0.7)]) * 0.12
    slabs = np.abs(varied(70, seed, [(1.0, 12, 1.9)]))
    h += np.clip(0.6 - slabs, 0, 1) * 0.06
    lam = lambert(h, 12)
    base = mix(np.array([52, 50, 56.]), np.array([122, 116, 112.]), lam)
    tint = varied(80, seed, [(1.0, 20, 1.5)])
    base = base + tint[..., None] * np.array([6, 3, -2.])
    grit = np.random.default_rng(90 + seed).random((N, N))
    base = base * (0.9 + 0.2 * grit[..., None])
    hollow = sstep(0.2, 0.9, -varied(85, seed, [(1.0, 25, 1.6)]))   # snow lies in the low spots
    scol, _ = snow(seed + 40)
    return mix(base, scol, hollow * 0.85), h

# ---- transitions -------------------------------------------------------------
EDGE_NOISE = 0.30 * pnoise(5, 18, 1.8) + 0.08 * pnoise(6, 60, 1.2)   # periodic: shared by all tiles

def corner_mask(bits):
    c00, c10, c01, c11 = [(bits >> i) & 1 for i in range(4)]
    bil = c00 * (1 - U) * (1 - V) + c10 * U * (1 - V) + c01 * (1 - U) * V + c11 * U * V
    # the wobble fades out where the corners agree, so an edge between two plain tiles is exactly plain
    return bil + EDGE_NOISE * np.clip(4 * bil * (1 - bil), 0, 1) * 1.6

def project(col):
    out = np.zeros((64, 128, 4)); ss = 3
    for oy in range(ss):
        for ox in range(ss):
            ys, xs = np.mgrid[0:64, 0:128].astype(float)
            x = xs + (ox + 0.5) / ss; y = ys + (oy + 0.5) / ss
            uu = (x - 64) / 128 + y / 64; vv = y / 64 - (x - 64) / 128
            e = 1.2 / 64
            inside = (uu >= -e) & (uu < 1 + e) & (vv >= -e) & (vv < 1 + e)
            iu = np.clip(np.floor(uu * N).astype(int), 0, N - 1); iv = np.clip(np.floor(vv * N).astype(int), 0, N - 1)  # clamp: transition tiles are not periodic
            out[..., :3] += col[iv, iu] * inside[..., None]; out[..., 3] += inside * 255
    cov = out[..., 3:4] / 255
    out[..., :3] = np.where(cov > 0, out[..., :3] / np.maximum(cov, 1e-6), 0)
    out[..., 3] /= ss * ss
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGBA')

def save(name, col): project(col).save(os.path.join(OUT, name + '.png'))

for s in range(3):
    save('snow-%d' % s, snow(s)[0])
SN, _ = snow(0)
for mat, fn in (('ice', ice), ('rock', rock)):
    M, _ = fn(0)
    for bits in range(1, 16):
        m = corner_mask(bits)
        t = sstep(0.47, 0.53, m)
        col = mix(SN, M, t)
        if mat == 'ice':
            shore = np.exp(-((m - 0.5) / 0.05) ** 2)          # raised snow lip along the shore
            col = mix(col, np.array([232, 238, 244.]), shore * 0.55 * (m < 0.5))
            shallow = 1 - sstep(0.5, 0.95, m)
            col = mix(col, np.array([118, 152, 176.]), shallow * (m >= 0.5) * 0.55)
            wet = np.exp(-((m - 0.56) / 0.04) ** 2) * (m >= 0.5)   # frosty rim just inside the ice
            col = mix(col, np.array([170, 196, 214.]), wet * 0.6)
        else:
            drift = np.exp(-((m - 0.5) / 0.06) ** 2) * (m < 0.5)   # snow piled against the rock edge
            col = mix(col, np.array([110, 122, 148.]), drift * 0.35)
        save('%s-%02d' % (mat, bits), col)
    for s in range(1, 3):   # extra interior variants so big lakes and rock fields do not repeat
        save('%s-15-%d' % (mat, s), fn(s)[0])
print('ok')
