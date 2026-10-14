# Installs the Pale Seer sheets at 3/4 size (192 px frames, like the King).
# Some generated cells hold the figure wrapped around the cell edge (the cloak that leaves on the
# right comes back in on the left). Each cell is rolled so its emptiest columns sit at the edges,
# then the figure is centred on the idle pose of that row, and stray bits from other rows are removed.
import sys, os
from PIL import Image
import numpy as np
from scipy import ndimage
SRC = sys.argv[1]; OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'sprites'); DBG = len(sys.argv) > 2 and sys.argv[2]
C, N = 256, 192
def clean(a, min_px=120):
    a = a.copy(); a[244:] = 0; a[:6] = 0
    m = a[..., 3] > 20; lab, n = ndimage.label(ndimage.binary_dilation(m, iterations=3), structure=np.ones((3, 3)))
    if n > 1:
        lab = lab * m
        sz = np.bincount(lab.ravel(), minlength=n + 1); keep = np.zeros(n + 1, bool)
        big = np.argmax(sz[1:]) + 1
        for i, sl in enumerate(ndimage.find_objects(lab)):
            if sl is None: continue
            y0, y1 = sl[0].start, sl[0].stop
            keep[i + 1] = sz[i + 1] >= min_px and not (y1 < 40) and not (y0 > 236)
        keep[big] = True; keep[0] = False
        a[~keep[lab] & m] = 0
    return a
def unwrap(a):
    col = a[..., 3].astype(float).sum(0); empty = col < 60
    if empty.all() or not empty.any(): return a
    # longest circular run of empty columns
    e2 = np.concatenate([empty, empty]); best, bs, run, st = 0, 0, 0, 0
    for i, v in enumerate(e2):
        if v: run += 1; st = i - run + 1
        else: run = 0
        if run > best and run <= C: best, bs = run, st
    mid = (bs + best // 2) % C
    return np.roll(a, -mid + 0, axis=1) if best > 8 else a
def close_gaps(a):
    # move and death: some cells have an empty band of columns cut through the figure; join the pieces again
    occ = (a[..., 3] > 20).sum(0) > 0; runs = []; s0 = None
    for x, v in enumerate(occ):
        if v and s0 is None: s0 = x
        if not v and s0 is not None: runs.append((s0, x)); s0 = None
    if s0 is not None: runs.append((s0, C))
    runs = [r for r in runs if r[1] - r[0] > 6]
    if len(runs) < 2: return a
    parts = [a[:, r0:r1] for r0, r1 in runs]
    # the pieces belong together where two cut edges meet: try each rotation, keep the one whose seams match best
    def seam(order):
        sc = 0
        for i in range(len(order) - 1):
            l = order[i][:, -1, 3].astype(float); r = order[i + 1][:, 0, 3].astype(float); sc += np.minimum(l, r).sum()
        return sc
    rots = [parts[k:] + parts[:k] for k in range(len(parts))]
    joined = np.concatenate(max(rots, key=seam), axis=1)
    out = np.zeros_like(a); w = min(C, joined.shape[1]); x0 = (C - w) // 2
    out[:, x0:x0 + w] = joined[:, :w]
    return out
def core_x(a):
    m = a[60:220, :, 3] > 200; ys, xs = np.nonzero(m)
    return float(np.median(xs)) if len(xs) else None
def shift(a, dx):
    out = np.zeros_like(a)
    if dx >= 0: out[:, dx:] = a[:, :C - dx]
    else: out[:, :C + dx] = a[:, -dx:]
    return out
SHEETS = {'idle': ('idle', 6), 'move': ('move', 8), 'cast': ('cast', 6), 'ward': ('ward-animation', 6), 'veilstep': ('veilstep', 8),
          'channel': ('channel', 6), 'hit': ('hit', 2), 'death': ('death', 8)}
def vroll(cell):
    # hit and death: the hem that leaves the bottom of the figure was painted back in at the top of the cell.
    # Find those wide, flat pieces near the top and hang them under the figure again.
    m = cell[..., 3] > 20
    lab, n = ndimage.label(m, structure=np.ones((3, 3)))
    if n < 2: return cell
    objs = ndimage.find_objects(lab); strip = np.zeros(n + 1, bool)
    for i, sl in enumerate(objs):
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        if y0 < 70 and y1 < 100 and (x1 - x0) > 40 and (y1 - y0) < 50: strip[i + 1] = True
    if not strip.any(): return cell
    sm = strip[lab]; body = m & ~sm
    if not body.any(): return cell
    ys = np.nonzero(body.any(1))[0]; by1 = ys[-1] + 1
    st = np.nonzero(sm.any(1))[0]; sy0 = st[0]
    out = cell.copy(); out[sm] = 0
    dy = by1 - sy0 - 2
    piece = np.where(sm[..., None], cell, 0)
    moved = np.zeros_like(cell); h = C - max(0, sy0 + dy) 
    moved[sy0 + dy:] = piece[sy0:sy0 + C - (sy0 + dy)] if sy0 + dy < C else moved[sy0 + dy:]
    keep = moved[..., 3] > out[..., 3]
    out[keep] = moved[keep]
    return out
def vfix(im, frames):
    # then stand each figure on the idle pose's foot line, at the idle pose's height
    out = np.zeros_like(im)
    for f in range(frames):
        for r in range(8):
            cell = vroll(im[r * C:(r + 1) * C, f * C:(f + 1) * C])
            if HIT_FALLBACK and ((cell[:70, :, 3] > 20).sum(1) > 70).any():
                cell = _idle[r * C:(r + 1) * C, 0:C]   # could not untangle this one: the idle pose (the game flashes it)
            occ = np.nonzero((cell[..., 3] > 30).sum(1) > 2)[0]
            if not len(occ): continue
            seg = cell[occ[0]:occ[-1] + 1]; h = seg.shape[0]
            if f == 0: SCALE[r] = min(1.0, IDLE_H / h) if h > IDLE_H * 1.04 else 1.0
            k = SCALE[r]
            if k < 1:
                sw = Image.fromarray(seg).resize((int(C * k), max(1, int(h * k))), Image.LANCZOS); h = sw.size[1]
                seg = np.zeros((h, C, 4), np.uint8); x0 = (C - sw.size[0]) // 2; seg[:, x0:x0 + sw.size[0]] = np.array(sw)
            y1 = FOOT; y0 = max(0, y1 - h)
            c2 = np.zeros((C, C, 4), np.uint8); c2[y0:y1] = seg[h - (y1 - y0):]
            out[r * C:(r + 1) * C, f * C:(f + 1) * C] = c2
    return out
IDLE = [None] * 8; SCALE = [1.0] * 8
_idle = np.array(Image.open(os.path.join(SRC, 'seer-idle.png')).convert('RGBA'))
_occ = np.nonzero((_idle[:C, :C, 3] > 30).sum(1) > 2)[0]; IDLE_H = _occ[-1] - _occ[0] + 1; FOOT = int(_occ[-1]) + 1
for name, (fn, frames) in SHEETS.items():
    im = np.array(Image.open(os.path.join(SRC, 'seer-' + fn + '.png')).convert('RGBA'))
    if name in ('hit', 'death'): SCALE = [1.0] * 8; HIT_FALLBACK = name == 'hit'; im = vfix(im, frames)
    out = Image.new('RGBA', (frames * N, 8 * N))
    for r in range(8):
        for f in range(frames):
            a = im[r * C:(r + 1) * C, f * C:(f + 1) * C]
            a = clean(close_gaps(clean(a)) if name in ('move', 'death') else a)
            cx = core_x(a)
            if name == 'idle' and f == 0: IDLE[r] = cx if cx is not None else 128.0
            if cx is not None and name not in ('death',):
                a = shift(a, int(round(IDLE[r] - cx)))
            elif cx is not None and name == 'death' and f < 4:
                a = shift(a, int(round(IDLE[r] - cx)))
            elif name == 'death':
                # lying down: keep the body over the spot it fell on (bounding box centre)
                xs = np.nonzero(a[..., 3].sum(0) > 60)[0]
                if len(xs): a = shift(a, int(round(IDLE[r] - (xs[0] + xs[-1]) / 2)))
            out.paste(Image.fromarray(a).resize((N, N), Image.LANCZOS), (f * N, r * N))
    out.save(os.path.join(OUT, 'seer-' + name + '.webp'), 'WEBP', quality=84, method=6)
    if DBG:
        bg = Image.new('RGBA', out.size, (40, 36, 34, 255)); bg.alpha_composite(out); bg.save(os.path.join(DBG, 'chk_' + name + '.png'))
for fx in ('lance', 'ward', 'starfall'):
    Image.open(os.path.join(SRC, 'seer-' + fx + '.png')).save(os.path.join(OUT, 'seer-fx-' + fx + '.webp'), 'WEBP', quality=90, method=6)
Image.open(os.path.join(SRC, 'prop-seer-pillar.png')).save(os.path.join(OUT, 'prop-seer-pillar.webp'), 'WEBP', quality=88, method=6)
print('ok')
