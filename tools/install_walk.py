# Installs the hero walk sheets.
# 1) removes stray fragments not attached to the figure
# 2) steadies the body: the generated frames drift sideways by up to ~8 px from frame to frame,
#    which reads as wobbling. Each frame is shifted so the upper body sits where the idle pose has it,
#    so the legs move under a steady torso and switching between idle and walk does not jump.
import sys, os, numpy as np
from PIL import Image
from scipy import ndimage
SRC = sys.argv[1]; OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'sprites')
C = 128
def upper_x(cell):
    m = cell[:, :, 3] > 60; ys, xs = np.nonzero(m)
    top = ys.min(); sel = (ys >= top + 4) & (ys < top + 46)
    return (xs[sel] * cell[ys[sel], xs[sel], 3]).sum() / cell[ys[sel], xs[sel], 3].sum()
for a in ['warrior', 'archer']:
    im = np.array(Image.open(os.path.join(SRC, a + '-walk.png')).convert('RGBA'))
    idle = np.array(Image.open(os.path.join(OUT, a + '-idle.webp')).convert('RGBA'))
    out = np.zeros_like(im)
    for d in range(8):
        target = upper_x(idle[d*C:(d+1)*C, 0:C])
        for f in range(8):
            cell = im[d*C:(d+1)*C, f*C:(f+1)*C].copy()
            mask = cell[:, :, 3] > 40
            lab, n = ndimage.label(mask, structure=np.ones((3, 3)))
            if n > 1:
                sizes = ndimage.sum(mask, lab, range(1, n + 1)); keep = 1 + int(np.argmax(sizes))
                grown = ndimage.binary_dilation(lab == keep, iterations=2)
                cell[~grown] = 0
            dx = int(round(target - upper_x(cell)))
            sh = np.zeros_like(cell)
            if dx >= 0: sh[:, dx:] = cell[:, :C - dx]
            else: sh[:, :C + dx] = cell[:, -dx:]
            out[d*C:(d+1)*C, f*C:(f+1)*C] = sh
            print(a, d, f, 'dx', dx) if abs(dx) > 6 else None
    Image.fromarray(out).save(os.path.join(OUT, a + '-walk.webp'), 'WEBP', quality=88, method=6)
    print(a, 'ok')
