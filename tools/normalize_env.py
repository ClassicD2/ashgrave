# Snaps the painted environment tiles to the exact 2:1 grid the game uses.
# The source walls are drawn as slightly narrow, off-centre cubes with their own proportions,
# so neighbours leave gaps. Each face is mapped with its own affine transform onto a true cube:
# top face 128x64, side faces 64 px tall, ground diamond's top vertex at (64,64).
import sys, glob, os
from PIL import Image, ImageDraw
import numpy as np
SRC, OUT = sys.argv[1], sys.argv[2]
FLOOR_INSET = 0.05

def alpha(im): return np.array(im.split()[3]) > 100

def affine_from(dst, src):
    # PIL wants the inverse map: output (x,y) -> input. Solve from 3 point pairs.
    A = []; b = []
    for (x, y), (u, v) in zip(dst, src):
        A.append([x, y, 1, 0, 0, 0]); b.append(u)
        A.append([0, 0, 0, x, y, 1]); b.append(v)
    return tuple(np.linalg.lstsq(np.array(A, float), np.array(b, float), rcond=None)[0])

def warp(im, size, faces):
    out = Image.new('RGBA', size, (0, 0, 0, 0))
    for dst, src, poly in faces:
        t = im.transform(size, Image.AFFINE, affine_from(dst, src), resample=Image.BICUBIC)
        m = Image.new('L', size, 0); ImageDraw.Draw(m).polygon(poly, fill=255)
        out.paste(t, (0, 0), m)
    return out

def cube_points(im):
    a = alpha(im); ys, xs = np.nonzero(a)
    top = ys.min(); bot = ys.max()
    rows = {y: (xs[ys == y].min(), xs[ys == y].max()) for y in range(top, bot + 1) if (ys == y).any()}
    # the top face, including any cap lip
    xlc = min(r[0] for r in rows.values()); xrc = max(r[1] for r in rows.values())
    ylc = min(y for y, r in rows.items() if r[0] <= xlc + 1); yrc = min(y for y, r in rows.items() if r[1] >= xrc - 1)
    tx = float(np.mean(xs[ys <= top + 1]))
    bx = float(np.mean(xs[ys >= bot - 1]))
    cy = ylc + yrc - top
    # the body below, measured from the middle of the sides
    mid = [rows[y] for y in range(50, 86) if y in rows]
    xl = int(np.median([r[0] for r in mid])); xr = int(np.median([r[1] for r in mid]))
    lby = ys[xs == xl + 3].max(); rby = ys[xs == xr - 3].max()
    side = bot - cy
    return dict(T=(tx, top), Lc=(xlc, ylc), Rc=(xrc, yrc), C=(bx, cy), L=(xl, lby - side), R=(xr, rby - side), LB=(xl, lby), RB=(xr, rby), B=(bx, bot))

def norm_wall(im):
    p = cube_points(im)
    T, L, R, C, LB, RB, B = (0+64, 0), (0, 32), (128, 32), (64, 64), (0, 96), (128, 96), (64, 128)
    W = 128; H = 128
    top_poly = [(64, -1), (129, 32), (64, 65), (-1, 32)]
    left_poly = [(-1, 31), (64.5, 64), (64.5, 129), (-1, 97)]
    right_poly = [(63.5, 64), (129, 31), (129, 97), (63.5, 129)]
    # Sample a little inside each face so the painted outline around every block is dropped;
    # neighbouring blocks then read as one wall instead of a row of separate pillars.
    k, kt = 0.07, 0.09
    lerp = lambda a, b, t: (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
    ct = lerp(p['Lc'], p['Rc'], 0.5)
    tT, tL, tR = lerp(p['T'], ct, kt), lerp(p['Lc'], ct, kt), lerp(p['Rc'], ct, kt)
    faces = [([T, L, R], [tT, tL, tR], top_poly),
             ([L, C, LB], [lerp(p['L'], p['C'], k), lerp(p['C'], p['L'], k * 0.4), lerp(p['LB'], p['B'], k)], left_poly),
             ([C, R, B], [lerp(p['C'], p['R'], k * 0.4), lerp(p['R'], p['C'], k), lerp(p['B'], p['RB'], k * 0.4)], right_poly)]
    out = warp(im, (W, H), faces)
    # The painted top has a 2x2 slab pattern with a bright rim, which makes every block read as
    # a separate pillar. Smooth the joints away so wall tops flow into each other.
    from PIL import ImageFilter, ImageEnhance
    arr = np.array(out).astype(float)
    ys2, xs2 = np.mgrid[0:H, 0:W]
    inside = (np.abs(xs2 - 64) / 64 + np.abs(ys2 - 32) / 32) <= 0.8
    base = np.median(arr[inside][:, :3], axis=0) * 0.78
    rng = np.random.default_rng(7)  # same grain on every block, so tops tile without a pattern break
    grain = np.array(Image.fromarray((rng.random((H, W)) * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(1.2))).astype(float) / 255 - 0.5
    t = np.zeros((H, W, 4)); t[..., :3] = base[None, None, :] * (1 + grain[..., None] * 0.22); t[..., 3] = 255
    top = Image.fromarray(np.clip(t, 0, 255).astype('uint8'), 'RGBA')
    m = Image.new('L', (W, H), 0); ImageDraw.Draw(m).polygon([(64, 0), (128, 32), (64, 64), (0, 32)], fill=255)
    out.paste(top, (0, 0), m)
    return out, p

def norm_floor(im):
    a = alpha(im); ys, xs = np.nonzero(a)
    top, bot = ys.min(), ys.max(); xl, xr = xs.min(), xs.max()
    tx = np.mean(xs[ys <= top + 1]); yl = np.mean(ys[xs <= xl + 1]); yr = np.mean(ys[xs >= xr - 1])
    # a hair of overlap hides the seams between neighbours
    # sample slightly inside the painted outline so tiles join without a dark seam
    cx, cy = (xl + xr) / 2, (yl + yr) / 2; k = FLOOR_INSET
    pt = lambda x, y: (x + (cx - x) * k, y + (cy - y) * k)
    faces = [([(64, 0), (0, 32), (128, 32)], [pt(tx, top), pt(xl, yl), pt(xr, yr)], [(-9, -9), (137, -9), (137, 73), (-9, 73)])]
    return warp(im, (128, 64), faces)

# Variants painted with an overhanging cap slab do not sit on the grid; their faces come from
# mirroring the clean opposite-side variant instead (a mirrored cube swaps its left and right faces).
CLEAN = ['wall-straight', 'wall-cracked-r', 'wall-moss-l', 'wall-moss-r', 'wall-banner-l', 'wall-torch-l']
MIRROR = {'wall-banner-r': 'wall-banner-l', 'wall-torch-r': 'wall-torch-l', 'wall-cracked-l': 'wall-cracked-r'}
done = {}
for n in CLEAN:
    out, p = norm_wall(Image.open(os.path.join(SRC, n + '.png')).convert('RGBA'))
    done[n] = out
    print(n, {k: (round(v[0]), round(v[1])) for k, v in p.items()})
for n, src in MIRROR.items(): done[n] = done[src].transpose(Image.FLIP_LEFT_RIGHT)
for n, im in done.items(): im.save(os.path.join(OUT, n + '.webp'), 'WEBP', quality=88, method=6)
for f in sorted(glob.glob(os.path.join(SRC, 'floor-*.png'))):
    n = os.path.basename(f)[:-4]
    if n == 'floor-tiles': continue
    norm_floor(Image.open(f).convert('RGBA')).save(os.path.join(OUT, n + '.webp'), 'WEBP', quality=88, method=6)
