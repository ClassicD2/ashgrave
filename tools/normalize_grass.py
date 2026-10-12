# Snaps the Barrow Fields (grass/forest) pack to the game's exact 2:1 grid.
# The painted walls sit inside a slightly smaller cube with opaque black filler around the edges, and the
# floors carry a dark painted outline; both would show as dark seams between neighbouring tiles.
# Walls: drop the black filler (flood fill from the border), then map each face onto a true cube.
# Floors: sample slightly inside the outline.
import sys, os
from PIL import Image, ImageDraw
import numpy as np
from scipy import ndimage
SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)

def affine_from(dst, src):
    A = []; b = []
    for (x, y), (u, v) in zip(dst, src):
        A.append([x, y, 1, 0, 0, 0]); b.append(u); A.append([0, 0, 0, x, y, 1]); b.append(v)
    return tuple(np.linalg.lstsq(np.array(A, float), np.array(b, float), rcond=None)[0])

def warp(im, size, faces):
    out = Image.new('RGBA', size, (0, 0, 0, 0))
    for dst, src, poly in faces:
        t = im.transform(size, Image.AFFINE, affine_from(dst, src), resample=Image.BICUBIC)
        m = Image.new('L', size, 0); ImageDraw.Draw(m).polygon(poly, fill=255)
        out.paste(t, (0, 0), m)
    return out

def strip_black(im, thr=28):
    a = np.array(im).copy()
    dark = (a[..., :3].max(axis=2) < thr) | (a[..., 3] < 10)
    lab, n = ndimage.label(dark)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    kill = np.isin(lab, list(border))
    a[kill, 3] = 0
    return Image.fromarray(a, 'RGBA')

def painted_cube(im):
    """Find the painted cube's key points from its silhouette (black filler removed)."""
    a = np.array(im)[..., 3] > 100; ys, xs = np.nonzero(a)
    top, bot = ys.min(), ys.max(); xl, xr = xs.min(), xs.max()
    tx = float(np.mean(xs[ys <= top + 1])); bx = float(np.mean(xs[ys >= bot - 1]))
    yl = float(np.min(ys[xs <= xl + 1])); yr = float(np.min(ys[xs >= xr - 1]))      # top of the side edges
    ylb = float(np.max(ys[xs <= xl + 1])); yrb = float(np.max(ys[xs >= xr - 1]))    # bottom of the side edges
    side = ((ylb - yl) + (yrb - yr)) / 2
    cy = bot - side                                                                  # front top corner
    return dict(T=(tx, top), L=(xl, yl), R=(xr, yr), C=(bx, cy), LB=(xl, ylb), RB=(xr, yrb), B=(bx, bot))

def norm_wall(im):
    im = strip_black(im)
    p = painted_cube(im)
    T, L, R, C, LB, RB, B = (64, 0), (0, 32), (128, 32), (64, 64), (0, 96), (128, 96), (64, 128)
    k = 0.035
    lerp = lambda a, b, t: (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
    mid = lerp(p['L'], p['R'], 0.5)
    faces = [([T, L, R], [lerp(p['T'], mid, k), lerp(p['L'], mid, k), lerp(p['R'], mid, k)], [(64, -1), (129, 32), (64, 65), (-1, 32)]),
             ([L, C, LB], [lerp(p['L'], p['C'], k), lerp(p['C'], p['L'], k * 0.4), lerp(p['LB'], p['B'], k)], [(-1, 31), (64.5, 64), (64.5, 129), (-1, 97)]),
             ([C, R, B], [lerp(p['C'], p['R'], k * 0.4), lerp(p['R'], p['C'], k), lerp(p['B'], p['RB'], k * 0.4)], [(63.5, 64), (129, 31), (129, 97), (63.5, 129)])]
    return warp(im, (128, 128), faces), p

def norm_floor(im, k=0.07):
    a = np.array(im)[..., 3] > 100; ys, xs = np.nonzero(a)
    top, bot = ys.min(), ys.max(); xl, xr = xs.min(), xs.max()
    tx = np.mean(xs[ys <= top + 1]); yl = np.mean(ys[xs <= xl + 1]); yr = np.mean(ys[xs >= xr - 1])
    cx, cy = (xl + xr) / 2, (yl + yr) / 2
    pt = lambda x, y: (x + (cx - x) * k, y + (cy - y) * k)
    faces = [([(64, 0), (0, 32), (128, 32)], [pt(tx, top), pt(xl, yl), pt(xr, yr)], [(-9, -9), (137, -9), (137, 73), (-9, 73)])]
    return warp(im, (128, 64), faces)

for f in sorted(os.listdir(SRC)):
    if not f.endswith('.png'): continue
    n = f[:-4]; im = Image.open(os.path.join(SRC, f)).convert('RGBA')
    if n.startswith(('hedge', 'ruinwall')):
        out, p = norm_wall(im); print(n, {k: (round(v[0]), round(v[1])) for k, v in p.items()})
    elif n.startswith(('grass', 'path')):
        out = norm_floor(im)
    else:
        out = im   # props and stairs are used as they are
    name = n if n.startswith(('prop-', 'stairs-')) else 'fo-' + n   # tiles get a prefix, props keep their names
    out.save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=88, method=6)
