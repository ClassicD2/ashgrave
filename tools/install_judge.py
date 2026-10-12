# Installs the Hollow Judge sheets at 3/4 size (192 px frames, like the Abbot) to keep the file small.
# The attack sheet's strike frames face the viewer whatever the direction, so the game only uses its
# wind-up and recovery frames (see client.js); stray bits that bled in from the next row are removed.
import sys, os
from PIL import Image
import numpy as np
from scipy import ndimage
def clean(cell, below=None, above=0, min_px=400):
    a = np.array(cell)
    if below: a[below:] = 0   # bits of the next row that bled into the bottom of the cell
    if above: a[:above] = 0   # ...and into the top
    m = a[..., 3] > 30; lab, n = ndimage.label(m, structure=np.ones((3, 3)))
    if n > 1:
        sz = ndimage.sum(m, lab, range(1, n + 1))
        for i, v in enumerate(sz):
            if v < min_px: a[lab == i + 1] = 0
    return Image.fromarray(a)
SRC = sys.argv[1]; OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'sprites')
C, N = 256, 192
SHEETS = {'idle': 4, 'walk': 8, 'hit': 2, 'judgement': 6, 'step': 6, 'attack': 6, 'death': 8}   # frames to keep per row
for name, frames in SHEETS.items():
    im = Image.open(os.path.join(SRC, 'judge-' + name + '.png')).convert('RGBA')
    out = Image.new('RGBA', (frames * N, 8 * N))
    for r in range(8):
        for f in range(frames):
            cell = im.crop((f * C, r * C, f * C + C, r * C + C))
            if name in ('attack', 'death'): cell = clean(cell, below=242 if name == 'attack' else None, above=20 if name == 'attack' else 0)
            cell = cell.resize((N, N), Image.LANCZOS)
            out.paste(cell, (f * N, r * N))
    out.save(os.path.join(OUT, 'judge-' + name + '.webp'), 'WEBP', quality=84, method=6)
Image.open(os.path.join(SRC, 'judgement-pillar.png')).save(os.path.join(OUT, 'judgement-pillar.webp'), 'WEBP', quality=88, method=6)
print('ok')
