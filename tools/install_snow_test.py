# Test-only snow level: the snow floor tiles plus frosted copies of existing walls and props.
# Frosting: colours pulled toward a cold grey-blue, and a cap of snow on every surface that faces up
# (opaque pixels with open air right above them).
import sys, os
import numpy as np
from PIL import Image
SNOW = sys.argv[1]; SP = os.path.join(os.path.dirname(__file__), '..', 'src', 'sprites')
for n in ['snow-a', 'snow-b', 'snow-drift', 'snow-steps', 'snow-ice', 'snow-rocks', 'snow-grass', 'snow-blood', 'snow-rune']:
    t = np.array(Image.open(os.path.join(SNOW, n + '.png')).convert('RGBA')).astype(float)
    t[..., :3] *= np.array([0.84, 0.86, 0.9])   # a little dimmer and colder, so heroes and wall tops stand out
    Image.fromarray(t.clip(0, 255).astype(np.uint8)).save(os.path.join(SP, 'sn-' + n[5:] + '.webp'), 'WEBP', quality=88, method=6)
def frost(src, dst, cap=4, top=False):
    a = np.array(Image.open(os.path.join(SP, src + '.webp')).convert('RGBA')).astype(float)
    rgb, al = a[..., :3], a[..., 3]
    lum = rgb @ np.array([0.3, 0.59, 0.11])
    cold = np.stack([lum * 0.86, lum * 0.93, lum * 1.08], -1) + np.array([10, 14, 22])
    rgb = rgb * 0.35 + cold * 0.65
    # snow caps: count how many pixels above are open air; the top few rows of each surface turn white
    op = al > 120; H = op.shape[0]; depth = np.zeros_like(lum)
    run = np.zeros(op.shape[1])
    for y in range(H):
        run = np.where(op[y], run + 1, 0); depth[y] = run
    snow = op & (depth <= cap)
    from scipy import ndimage
    noise = ndimage.gaussian_filter(np.random.default_rng(len(src)).random(lum.shape), 2.5); noise = (noise - noise.min()) / (np.ptp(noise) + 1e-9)
    if top:   # a wall block's flat top is a diamond in the upper half: cover it with snow
        yy, xx = np.mgrid[0:H, 0:op.shape[1]]
        dia = (np.abs(xx - 63.5) / 64 + np.abs(yy - 31.5) / 32) <= 0.97
        snow |= op & dia
    white = np.array([226, 233, 242]) - 26 * noise[..., None]
    k = np.where(snow, 0.85, 0)[..., None]
    rgb = rgb * (1 - k) + white * k
    a[..., :3] = rgb.clip(0, 255)
    Image.fromarray(a.astype(np.uint8)).save(os.path.join(SP, dst + '.webp'), 'WEBP', quality=88, method=6)
for w in ['wall-straight', 'wall-cracked-l', 'wall-cracked-r', 'wall-moss-l', 'wall-moss-r']:
    frost(w, 'sn-' + w, cap=3, top=True)
for p in ['dead-tree', 'rubble-pile', 'broken-pillar', 'gravestone', 'gravestone-b', 'skeleton-remains', 'stone-circle']:
    if os.path.exists(os.path.join(SP, 'prop-' + p + '.webp')): frost('prop-' + p, 'prop-sn-' + p, cap=3)
print('ok')
