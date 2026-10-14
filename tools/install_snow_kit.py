# Codex snow kit: wall blocks are drawn a little small inside their canvas, so each is cropped to its
# outline and stretched to fill the 128x128 tile like the other walls. Props and stairs go in as they are.
import sys, os, glob
import numpy as np
from PIL import Image
SRC = sys.argv[1]; SP = os.path.join(os.path.dirname(__file__), '..', 'src', 'sprites')
for f in sorted(glob.glob(os.path.join(SRC, 'sn-*.png'))):
    im = Image.open(f).convert('RGBA'); a = np.array(im)[..., 3] > 20
    ys, xs = np.nonzero(a); im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)).resize((128, 128), Image.LANCZOS)
    im.save(os.path.join(SP, 'snw-' + os.path.basename(f)[3:-4] + '.webp'), 'WEBP', quality=88, method=6)
for f in sorted(glob.glob(os.path.join(SRC, 'prop-sn-*.png'))) + [os.path.join(SRC, 'stairs-down-snow.png')]:
    Image.open(f).convert('RGBA').save(os.path.join(SP, os.path.basename(f)[:-4] + '.webp'), 'WEBP', quality=88, method=6)
print('ok')
