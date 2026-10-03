"""Bundle the new release's public runtime files for reproducible static builds.

Run after publish-new-assets.py and the publication review. The catalogue and
release record select the files; source art, private inputs and logs are excluded.
"""
import hashlib
import json
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
release = json.loads((root/'data/new-assets-release.json').read_text(encoding='utf-8'))
catalog = json.loads((root/'public/gallery/catalog.js').read_text(encoding='utf-8').removeprefix('window.GALLERY=').removesuffix(';'))
ids = set(release['items'])
files = set()
for item in catalog['items']:
    if item['id'] not in ids:
        continue
    files.update(p['file'] for p in item['previews'])
    files.update([item['thumbnail'],item['download']['file']])
    if item.get('motion'):
        files.update([item['motion'],'sheets/'+item['id']+'.png'])
folder = root/'data/release-assets'/release['date']
folder.mkdir(parents=True,exist_ok=True)
manifest = {'version':1,'bundles':[],'files':[]}
parts = [[]]
size = 0
for name in sorted(files):
    data = (root/'public/gallery'/name).read_bytes()
    if size + len(data) > 20*1024*1024:
        parts.append([]);size=0
    parts[-1].append(('gallery/'+name,data));size += len(data)
for index,part in enumerate(parts,1):
    name = f'assets-{index:02}.zip'
    target = folder/name
    with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for path,data in part:
            info = zipfile.ZipInfo(path,date_time=(2026,10,3,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
            z.writestr(info,data)
            manifest['files'].append({'path':path,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'bundle':name})
    blob = target.read_bytes()
    assert len(blob) < 25*1024*1024
    manifest['bundles'].append({'file':name,'bytes':len(blob),'sha256':hashlib.sha256(blob).hexdigest()})
(folder/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
ignore = root/'.gitignore'
value = ignore.read_text(encoding='utf-8')
marker = '# Generated publication assets; verified sources are in data/release-assets.\n'
end_marker = '# End generated publication assets.\n'
if marker in value:
    before,managed = value.split(marker,1)
    _,after = managed.split(end_marker,1)
    value = before+after
value += '\n'+marker+'tools/__pycache__/\n'
value += ''.join('/public/'+f['path']+'\n' for f in manifest['files'])
value += end_marker
ignore.write_text(value,encoding='utf-8')
print(json.dumps({'files':len(manifest['files']),'bundles':len(manifest['bundles']),
                  'bundleBytes':sum(b['bytes'] for b in manifest['bundles'])}))
