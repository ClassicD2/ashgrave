# Installs the hero walk sheets: removes stray fragments (pieces not attached to the figure) and writes webp.
import sys, os, numpy as np
from PIL import Image
from scipy import ndimage
SRC = sys.argv[1]; OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'sprites')
for a in ['warrior', 'archer']:
    im = np.array(Image.open(os.path.join(SRC, a + '-walk.png')).convert('RGBA'))
    for d in range(8):
        for f in range(8):
            cell = im[d*128:(d+1)*128, f*128:(f+1)*128]
            mask = cell[:, :, 3] > 8
            lab, n = ndimage.label(mask, structure=np.ones((3, 3)))
            if n > 1:
                sizes = ndimage.sum(mask, lab, range(1, n + 1)); keep = 1 + int(np.argmax(sizes))
                cell[(lab != keep) & (lab > 0)] = 0
    Image.fromarray(im).save(os.path.join(OUT, a + '-walk.webp'), 'WEBP', quality=88, method=6)
    print(a, 'ok')
