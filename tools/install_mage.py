# Installs the Mage sheets: removes stray specks, steadies the walk (torso held where the idle pose has it),
# and writes webp. Glows on the attack/cast sheets are kept (only tiny specks are dropped).
import sys, os, shutil, numpy as np
from PIL import Image
from scipy import ndimage
SRC = sys.argv[1]; OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'sprites'); C = 128
def clean(cell, min_px=40):
    mask = cell[:, :, 3] > 30
    lab, n = ndimage.label(mask, structure=np.ones((3, 3)))
    if n > 1:
        sizes = ndimage.sum(mask, lab, range(1, n + 1))
        for i, sz in enumerate(sizes):
            if sz < min_px: cell[lab == i + 1] = 0
    return cell
def upper_x(cell):
    m = cell[:, :, 3] > 60; ys, xs = np.nonzero(m); top = ys.min(); sel = (ys >= top + 4) & (ys < top + 46)
    w = cell[ys[sel], xs[sel], 3].astype(float); return (xs[sel] * w).sum() / w.sum()
idle = None
for name in ['idle', 'walk', 'attack', 'cast', 'hit', 'death']:
    im = np.array(Image.open(os.path.join(SRC, 'mage-' + name + '.png')).convert('RGBA'))
    cols = im.shape[1] // C
    for d in range(8):
        for f in range(cols):
            cell = clean(im[d*C:(d+1)*C, f*C:(f+1)*C].copy())
            if name in ('walk', 'idle'): cell[118:] = 0   # glow specks below the feet
            if name == 'walk':
                dx = int(round(upper_x(idle[d*C:(d+1)*C, 0:C]) - upper_x(cell)))
                sh = np.zeros_like(cell)
                if dx >= 0: sh[:, dx:] = cell[:, :C - dx]
                else: sh[:, :C + dx] = cell[:, -dx:]
                cell = sh
            im[d*C:(d+1)*C, f*C:(f+1)*C] = cell
    if name == 'idle': idle = im.copy()
    Image.fromarray(im).save(os.path.join(OUT, 'mage-' + name + '.webp'), 'WEBP', quality=88, method=6)
for n in ['icon-staff', 'ground-staff']:
    Image.open(os.path.join(SRC, n + '.png')).save(os.path.join(OUT, n + '.webp'), 'WEBP', quality=92, method=6)
print('ok')
