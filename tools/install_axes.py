# Axe item art: inventory icons (kept at 128 px, shown at ~54 px, so they stay sharp on hi-dpi screens)
# and ground drops (96x64, drawn at 48x32).
import sys, os
from PIL import Image
SRC = sys.argv[1]; OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'sprites')
for n in ('hand-axe', 'war-axe', 'battle-axe', 'marrowcleaver'):
    for k in ('icon', 'ground'):
        Image.open(os.path.join(SRC, '%s-%s.png' % (k, n))).convert('RGBA').save(os.path.join(OUT, '%s-%s.webp' % (k, n)), 'WEBP', quality=90, method=6)
print('ok')
