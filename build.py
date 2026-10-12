import pathlib, json
from tiles import atlas
src=pathlib.Path('src'); h=(src/'index.html').read_text()
for k,f in [('STYLE','style.css'),('DATA','data.js'),('ENGINE','engine.js'),('CLIENT','client.js')]:
    h=h.replace('/*%s*/'%k,(src/f).read_text())
svg,cells=atlas()
import base64
spr=json.loads((src/'sprites/sprites.json').read_text())
# Abbot sheets are stored at 3/4 size (192 px frames) to keep the file small; pxScale restores world size.
for big in ('abbot', 'judge', 'king'):
    ab=spr['actors'][big]; ab['frameSize']=192; ab['anchor']=[96,174]; ab['pxScale']=256/192
for a in spr['actors'].values():
    a.setdefault('anchor',[64,112]); a.setdefault('pxScale',1)
# Images are separate files next to the page (dist/img), named by content hash: the browser caches them,
# and an update only downloads the images that actually changed.
import hashlib, shutil
out=pathlib.Path('dist'); imgdir=out/'img'
shutil.rmtree(imgdir, ignore_errors=True); imgdir.mkdir(parents=True)
imgs={}
for f in sorted((src/'sprites').glob('*.webp')):
    b=f.read_bytes(); name='%s.%s.webp'%(f.stem, hashlib.sha1(b).hexdigest()[:8])
    (imgdir/name).write_bytes(b); imgs[f.stem]='img/'+name
h=h.replace('/*SPRITES*/','var SPRITES = '+json.dumps({'meta':spr,'img':imgs})+';')
h=h.replace('/*TILES*/','var TILE_ATLAS = '+json.dumps({'svg':svg,'cells':cells})+';')
import datetime
stamp=(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(hours=2)).strftime('%Y-%m-%d %H:%M')
h=h.replace('/*BUILD*/','var BUILD = '+json.dumps(stamp)+';',1)
h=h.replace('<div class="tools"><button class="tb" id="bImport">','<p class="hint ver">Build '+stamp+'</p>\n    <div class="tools"><button class="tb" id="bImport">',1)
(out/'index.html').write_text(h)
(out/'ashgrave.html').unlink(missing_ok=True)
print('page', len(h), 'images', len(imgs), sum((imgdir/p.split('/')[1]).stat().st_size for p in imgs.values()))
