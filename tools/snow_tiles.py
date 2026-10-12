# Procedural snow floor tiles for Ashgrave (128x64 isometric diamonds).
# Every tile is built in tile space (u,v in [0,1)) and projected onto the 2:1 diamond.
# Seamless rule: all variants share the same periodic base near the tile edges and only differ
# in the interior, so any variant can sit next to any other without a seam.
import sys, os, numpy as np
from PIL import Image
N = 256                      # texture resolution in tile space
OUT = sys.argv[1] if len(sys.argv) > 1 else 'snow_out'
os.makedirs(OUT, exist_ok=True)
u = (np.arange(N) + 0.5) / N
U, V = np.meshgrid(u, u, indexing='xy')

def pnoise(seed, scale, power=2.0):
    """Periodic noise: white noise filtered in frequency space (wraps at the tile edge)."""
    r = np.random.default_rng(seed)
    f = np.fft.fftfreq(N) * N
    FX, FY = np.meshgrid(f, f)
    k = np.sqrt(FX ** 2 + FY ** 2); k[0, 0] = 1
    spec = np.fft.fft2(r.standard_normal((N, N))) / (k ** power) * np.exp(-(k / scale) ** 2)
    spec[0, 0] = 0
    n = np.real(np.fft.ifft2(spec)); return (n - n.mean()) / (n.std() + 1e-9)

def edge_weight():
    """0 at tile edges, 1 in the interior: where a variant may differ from the shared base."""
    d = np.minimum.reduce([U, 1 - U, V, 1 - V])
    return np.clip((d - 0.06) / 0.16, 0, 1) ** 1.5

W = edge_weight()
BASE_H = 0.55 * pnoise(1, 40, 1.6) + 0.3 * pnoise(2, 90, 1.2) + 0.12 * pnoise(3, 200, 0.8)

def ripples(seed, amt, freq=9):
    # wind ripples (sastrugi) running diagonally, wobbled by noise, periodic in tile space
    wob = pnoise(seed, 20, 1.8) * 0.12
    return amt * np.sin(2 * np.pi * (freq * (U + 0.35 * V) + wob)) * (0.6 + 0.4 * pnoise(seed + 1, 15, 1.5))

def blob(cx, cy, rx, ry, rot=0.0):
    x, y = U - cx, V - cy
    c, s = np.cos(rot), np.sin(rot)
    xr, yr = x * c + y * s, -x * s + y * c
    return np.clip(1 - (xr / rx) ** 2 - (yr / ry) ** 2, 0, 1)

SNOW_LIT = np.array([222, 228, 236.]); SNOW_SHADE = np.array([92, 108, 140.]); SNOW_MID = np.array([168, 178, 196.])

def shade(h, albedo=None, sparkle_seed=None, sparkle=0.0):
    hh = h * 9.0  # periodic gradient so the shading wraps cleanly at the tile edge
    gx = (np.roll(hh, -1, 1) - np.roll(hh, 1, 1)) / 2; gy = (np.roll(hh, -1, 0) - np.roll(hh, 1, 0)) / 2
    # light from the upper left of the screen = from -u (screen left/up) in tile space
    L = np.array([-0.55, -0.35, 0.76]); L /= np.linalg.norm(L)
    nz = 1 / np.sqrt(gx ** 2 + gy ** 2 + 1)
    lam = np.clip((-gx * L[0] - gy * L[1] + L[2]) * nz, 0, 1)
    t = lam[..., None]
    col = SNOW_SHADE * (1 - t) + SNOW_LIT * t
    col = col * 0.8 + SNOW_MID * 0.2
    if albedo is not None:
        a, c = albedo
        lit = (0.55 + 0.6 * lam)[..., None]
        col = col * (1 - a[..., None]) + c * lit * a[..., None]
    if sparkle_seed is not None:
        r = np.random.default_rng(sparkle_seed)
        sp = (r.random((N, N)) < sparkle) & (lam > 0.7)
        col[sp] = np.minimum(255, col[sp] + 45)
    return col

def project(col):
    """Tile space -> 128x64 diamond with 3x3 supersampling."""
    out = np.zeros((64, 128, 4))
    ss = 3
    for oy in range(ss):
        for ox in range(ss):
            ys, xs = np.mgrid[0:64, 0:128].astype(float)
            x = xs + (ox + 0.5) / ss; y = ys + (oy + 0.5) / ss
            uu = (x - 64) / 128 + y / 64; vv = y / 64 - (x - 64) / 128
            e = 1.2 / 64
            inside = (uu >= -e) & (uu < 1 + e) & (vv >= -e) & (vv < 1 + e)
            iu = (np.floor(uu * N).astype(int)) % N; iv = (np.floor(vv * N).astype(int)) % N
            c = col[iv, iu]
            out[..., :3] += c * inside[..., None]; out[..., 3] += inside * 255
    cov = out[..., 3:4] / 255
    out[..., :3] = np.where(cov > 0, out[..., :3] / np.maximum(cov, 1e-6), 0)  # straight (not premultiplied) colour
    out[..., 3] /= ss * ss
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGBA')

def tile(name, extra_h=None, albedo=None, seed=0, sparkle=0.004):
    h = BASE_H.copy()
    # each variant gets its own interior noise so tiles do not repeat visibly
    h = h * (1 - W) + (0.55 * pnoise(100 + seed, 40, 1.6) + 0.25 * pnoise(200 + seed, 90, 1.2) + 0.08 * pnoise(300 + seed, 200, 0.8)) * W
    h = h * 0.16 + ripples(900 + seed, 0.012, 7) 
    if extra_h is not None: h = h + extra_h * W
    col = shade(h, albedo, 500 + seed, sparkle)
    project(col).save(os.path.join(OUT, name + '.png'))

# --- variants ---------------------------------------------------------------
tile('snow-a', seed=1)
tile('snow-b', seed=2)
tile('snow-drift', extra_h=ripples(7, 0.06), seed=3)
# footprints: two staggered rows of small dents along a diagonal
fp = np.zeros((N, N))
for i in range(5):
    t = 0.18 + i * 0.16; side = 0.045 if i % 2 else -0.045
    fp -= blob(t + side * 0.5, 0.82 - t + side, 0.05, 0.028, 0.8) ** 0.6 * 0.07
tile('snow-steps', extra_h=fp, seed=4)
# ice patch with cracks
ice = np.clip((blob(0.5, 0.5, 0.36, 0.26, 0.5) + 0.35 * pnoise(41, 12, 1.8) - 0.15) * 3, 0, 1)
cr = np.abs(pnoise(42, 60, 1.3)) < 0.05
ice_col = np.array([86, 118, 150.]) + 0 * U[..., None]
ice_col = ice_col + (pnoise(43, 50, 1.4)[..., None] * 10)
ice_col[cr & (ice > 0.3)] = [190, 214, 232]
tile('snow-ice', extra_h=-ice * 0.01, albedo=((ice * W).clip(0, 0.92), ice_col), seed=5, sparkle=0.002)
# rocks poking through
rk = np.zeros((N, N)); rmask = np.zeros((N, N))
for (cx, cy, rx, ry, rot) in [(0.42, 0.55, 0.11, 0.08, 0.4), (0.6, 0.38, 0.07, 0.05, 1.1), (0.35, 0.33, 0.05, 0.04, 0.2)]:
    b = blob(cx, cy, rx, ry, rot); rk += b ** 0.5 * 0.12; rmask = np.maximum(rmask, (b > 0.25) * 1.0)
rock_col = np.array([104, 100, 104.]) + pnoise(51, 60, 1.2)[..., None] * 9
cap = (pnoise(52, 25, 1.8) > 0.2)   # snow caps stay on the rock tops
tile('snow-rocks', extra_h=rk, albedo=((rmask * (~cap) * W * 0.95), rock_col), seed=6)
# dead grass tufts through the snow
g = np.zeros((N, N)); r = np.random.default_rng(61)
for _ in range(9):
    kx, ky = 0.22 + r.random() * 0.56, 0.22 + r.random() * 0.56
    for _ in range(14):
        cx, cy = kx + r.normal() * 0.035, ky + r.normal() * 0.035
        g = np.maximum(g, blob(cx, cy, 0.007, 0.03, np.pi / 4 + r.normal() * 0.35) * (r.random() * 0.5 + 0.5))
grass_col = np.array([112, 96, 62.]) + pnoise(62, 80, 1.0)[..., None] * 14
tile('snow-grass', albedo=((g ** 0.4 * W * 0.9), grass_col), seed=7)
# frozen bones / dark old blood under ice: subtle
bl = blob(0.5, 0.5, 0.22, 0.14, 0.7) ** 0.8 * np.clip(0.5 + pnoise(71, 25, 1.6), 0, 1)
tile('snow-blood', albedo=((bl * W * 0.55), np.array([92, 38, 44.])), seed=8)
# frosted rune: faint glowing circle under thin ice
rr = np.hypot((U - 0.5) * 1.0, (V - 0.5) * 1.0)
ring = (np.abs(rr - 0.24) < 0.012) | (np.abs(rr - 0.17) < 0.008) | ((np.abs(U - V) < 0.01) & (rr < 0.24)) | ((np.abs(U + V - 1) < 0.01) & (rr < 0.24))
tile('snow-rune', albedo=((ring * 0.85 * W), np.array([140, 200, 255.])), seed=9, sparkle=0.002)
print('ok')
