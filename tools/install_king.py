# Installs the Hollowed King sheets at 3/4 size (192 px frames, like the Judge and the Abbot).
# Bits of the neighbouring rows and cells that bled into a cell are removed: anything above y=20 or
# below y=238 (feet stand at 231) and loose specks.
import sys, os
from PIL import Image
import numpy as np
from scipy import ndimage
def clean(cell, min_px=150):
    a = np.array(cell)
    a[238:] = 0; a[:20] = 0
    m = a[..., 3] > 30; lab, n = ndimage.label(m, structure=np.ones((3, 3)))
    if n > 1:
        sz = np.bincount(lab.ravel())
        small = sz < min_px; small[0] = False
        # strays: entirely in the top strip, entirely below the knees, or hugging the left/right edge
        objs = ndimage.find_objects(lab)
        for i, sl in enumerate(objs):
            y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
            if y1 < 75 or y0 > 212 or x1 < 34 or x0 > 222: small[i + 1] = True
        if small[1:].all(): small[np.argmax(sz[1:]) + 1] = False
        a[small[lab]] = 0
    return Image.fromarray(a)
SRC = sys.argv[1]; OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'sprites')
C, N = 256, 192
def feet_x(cell):
    a = np.array(cell); m = a[163:177, :, 3] > 90; ys, xs = np.nonzero(m)
    return float(np.median(xs)) if len(xs) else None
# Blade Tempest and Shed the Mantle drift sideways in the cell as the cloak swings out, which made the
# King slide off his own spot while spinning: pin each frame's feet to where they stand in the idle row.
ALIGN = ('tempest', 'shed')
IDLE_FEET = [None] * 8
SHEETS = {'idle': 4, 'walk': 8, 'hit': 2, 'attack': 6, 'tempest': 6, 'charge': 6, 'shed': 6, 'death': 8}
for name, frames in SHEETS.items():
    im = Image.open(os.path.join(SRC, 'king-' + name + '.png')).convert('RGBA')
    out = Image.new('RGBA', (frames * N, 8 * N))
    for r in range(8):
        for f in range(frames):
            cell = clean(im.crop((f * C, r * C, f * C + C, r * C + C))).resize((N, N), Image.LANCZOS)
            if name == 'idle' and f == 0: IDLE_FEET[r] = feet_x(cell)
            if name in ALIGN:
                fx = feet_x(cell)
                if f == 0: dx = 0   # a frame with no feet visible (mid-spin) keeps the previous frame's shift
                if fx is not None and IDLE_FEET[r] is not None: dx = int(round(IDLE_FEET[r] - fx))
                if dx:
                    sh = Image.new('RGBA', (N, N)); sh.paste(cell, (dx, 0)); cell = sh
            out.paste(cell, (f * N, r * N))
    out.save(os.path.join(OUT, 'king-' + name + '.webp'), 'WEBP', quality=84, method=6)
Image.open(os.path.join(SRC, 'king-blade.png')).save(os.path.join(OUT, 'king-blade.webp'), 'WEBP', quality=90, method=6)
Image.open(os.path.join(SRC, 'prop-throne.png')).save(os.path.join(OUT, 'prop-throne.webp'), 'WEBP', quality=88, method=6)
print('ok')
