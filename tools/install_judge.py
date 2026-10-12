# Installs the Hollow Judge sheets at 3/4 size (192 px frames, like the Abbot) to keep the file small.
# Only the sheets that came out right are installed; attack and death are being redone.
import sys, os
from PIL import Image
SRC = sys.argv[1]; OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'sprites')
C, N = 256, 192
SHEETS = {'idle': 4, 'walk': 8, 'hit': 2, 'judgement': 6, 'step': 6}   # frames to keep per row
for name, frames in SHEETS.items():
    im = Image.open(os.path.join(SRC, 'judge-' + name + '.png')).convert('RGBA')
    out = Image.new('RGBA', (frames * N, 8 * N))
    for r in range(8):
        for f in range(frames):
            cell = im.crop((f * C, r * C, f * C + C, r * C + C)).resize((N, N), Image.LANCZOS)
            out.paste(cell, (f * N, r * N))
    out.save(os.path.join(OUT, 'judge-' + name + '.webp'), 'WEBP', quality=84, method=6)
Image.open(os.path.join(SRC, 'judgement-pillar.png')).save(os.path.join(OUT, 'judgement-pillar.webp'), 'WEBP', quality=88, method=6)
print('ok')
