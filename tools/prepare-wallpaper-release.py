"""Curate the finished wallpaper from an explicit source directory.

Preserves the offline runtime and authored image bytes; excludes generation
prompts and private rendering tools. The original MP4 uses release hosting.
"""
import argparse, hashlib, io, json, zipfile
from pathlib import Path
from PIL import Image

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('source',type=Path)
args=parser.parse_args()
source=args.source.resolve();root=Path(__file__).resolve().parents[1]
gallery=root/'public/gallery';out=root/'.publication-audit'
sha=lambda b:hashlib.sha256(b).hexdigest()
id='alchemy-of-britannia-wallpaper'
runtime=['index.html','wallpaper.js','assets/fullmetal-alchemist.png','assets/ultima-online.png']
payload={name:(source/name).read_bytes() for name in runtime}
for name,blob in payload.items():
    if name.endswith(('.html','.js')):
        text=blob.decode('utf-8-sig')
        assert 'C:/Users/' not in text and 'C:\\Users\\' not in text
        assert not any(k in text for k in ('fetch(','XMLHttpRequest','WebSocket','https://','http://'))
readme='''ALCHEMY OF BRITANNIA — OFFLINE LIVE WALLPAPER

A generated Fullmetal Alchemist / Ultima Online fan illustration with a
32-second transition between two scenes. Motion comes from camera drift,
embers, mist, lighting and a portal wipe. Characters are illustrated stills,
not frame-by-frame animated characters. There is no soundtrack.

OPEN THE LIVE VERSION
Extract the complete ZIP, keeping assets/ beside index.html and wallpaper.js.
Open index.html in a modern browser. It works offline with no dependencies,
network requests, tracking or account. Opening it installs nothing and does
not change your desktop wallpaper. Its animation pauses in a hidden tab.

Keyboard controls while the page is focused:
Space — pause/resume; H — show/hide help; F — fullscreen.
1 — hold the Fullmetal Alchemist scene; 2 — hold the Ultima Online scene;
0 — resume automatic transitions. The original illustrations are included.

DESKTOP WALLPAPER
Windows needs a separate live-wallpaper application. Add this extracted
index.html to a compatible web-wallpaper application, or download the silent
1920x1080 / 30fps / 32-second MP4 from the website and use its video mode.
No wallpaper application is installed or bundled by this package. Desktop
application keyboard behavior depends on focus. The original delivery was
previewed in a browser and has not been applied to the system desktop.

The scene fills the window using cover scaling; other aspect ratios crop
the edges. Automatic timing: first scene 0–12s; transition 12–16s; second
scene 16–28s; transition back 28–32s. This is fan artwork, not game/client
art or an official product. No client files, accounts or saves are included.
'''
payload['README.txt']=readme.encode('utf-8')
payload['SHA256SUMS.txt']=''.join(sha(blob)+'  '+name+'\n' for name,blob in sorted(payload.items())).encode()
download='downloads/tools/alchemy-of-britannia-offline.zip'
target=gallery/download;target.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for name,blob in sorted(payload.items()):
        info=zipfile.ZipInfo(name,(2026,10,16,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,blob)
with zipfile.ZipFile(target) as z:
    assert z.testzip() is None and all(z.read(n)==b for n,b in payload.items())
assert target.stat().st_size<25*1024*1024
public_files=[download];previews=[]
for name,label in [('preview-transition.png','The portal between two worlds'),('preview-fullmetal.png','Fullmetal Alchemist scene'),('preview-ultima.png','Ultima Online scene')]:
    with Image.open(source/name) as image:
        image=image.convert('RGB');image.thumbnail((1440,810));stream=io.BytesIO();image.save(stream,format='JPEG',quality=88,optimize=True)
        assert image.size==(1440,810)
    file='media/new-assets/alchemy-of-britannia-'+name.removeprefix('preview-').replace('.png','.jpg')
    (gallery/file).write_bytes(stream.getvalue());public_files.append(file)
    previews.append({'label':label+' — frame from the offline animation','file':file})
notes='Generated Fullmetal Alchemist / Ultima Online fan illustration. A 32-second silent live wallpaper with camera drift, mist, embers, lighting and a portal transition; characters are illustrated stills, not frame-by-frame animated characters. Offline HTML, JavaScript and two original image assets included. Opening the page installs nothing. Desktop wallpaper use requires a separate compatible application. Original 1080p video and setup details: www.uoassets.com/wallpapers/.'
card={'id':id,'name':'Alchemy of Britannia — live wallpaper','project':'Alchemy-of-Britannia','category':'Interface','kind':'static','notes':notes,'thumbnail':previews[0]['file'],'previews':previews,'download':{'file':download,'sizeBytes':target.stat().st_size,'sha256':sha(target.read_bytes()),'label':'Offline live wallpaper + two illustrations + guide','status':'Browser ready; desktop wallpaper requires a separate application'}}
catalog_path=gallery/'catalog.js';catalog=json.loads(catalog_path.read_text(encoding='utf-8')[15:-1]);assert not any(i['id']==id for i in catalog['items']);catalog['items'].append(card)
catalog_path.write_text('window.GALLERY='+json.dumps(catalog,ensure_ascii=False,separators=(',',':'))+';',encoding='utf-8')
video=source/'Alchemy-of-Britannia-1080p.mp4'
report={'title':'Alchemy of Britannia','date':'2026-10-16','page':'/wallpapers/','galleryId':id,'releaseTag':'uo-wallpapers-2026-10-16','offline':card['download'],'runtimeFiles':[{'file':n,'bytes':len(b),'sha256':sha(b)} for n,b in payload.items() if n in runtime],'previews':previews,'video':{'file':video.name,'url':'https://github.com/Celobra/uo-asset-downloads/releases/download/uo-wallpapers-2026-10-16/Alchemy-of-Britannia-1080p.mp4','sizeBytes':video.stat().st_size,'sha256':sha(video.read_bytes()),'width':1920,'height':1080,'fps':30,'durationSeconds':32,'decodedFrames':960,'audioTracks':0},'description':notes,'desktopInstallationTested':False,'originalRuntimeBytesPreserved':True,'sourcePromptsAndToolsExcluded':True,'publicFiles':['gallery/'+p for p in public_files]}
(root/'data/wallpapers-release.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
folder=root/'data/release-assets/2026-10-16';mf=folder/'manifest.json';manifest=json.loads(mf.read_text(encoding='utf-8'));existing={f['path'] for f in manifest['files']};assert not existing.intersection('gallery/'+n for n in public_files)
parts=[[]];size=0
for name in public_files:
    blob=(gallery/name).read_bytes()
    if size+len(blob)>20*1024*1024 and parts[-1]:parts.append([]);size=0
    parts[-1].append(('gallery/'+name,blob));size+=len(blob)
for index,part in enumerate(parts,len(manifest['bundles'])+1):
    name=f'assets-{index:02}.zip';target=folder/name;assert not target.exists()
    with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for name2,blob in part:
            info=zipfile.ZipInfo(name2,(2026,10,16,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,blob)
            manifest['files'].append({'path':name2,'bytes':len(blob),'sha256':sha(blob),'bundle':name})
    blob=target.read_bytes();assert len(blob)<25*1024*1024;manifest['bundles'].append({'file':name,'bytes':len(blob),'sha256':sha(blob)})
mf.write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
ignore=root/'.gitignore';ignore.write_text(ignore.read_text(encoding='utf-8')+'\n# Curated offline wallpaper and preview derivatives\n'+''.join('/public/gallery/'+n+'\n' for n in public_files),encoding='utf-8')
print(json.dumps({'galleryCard':id,'offlineBytes':report['offline']['sizeBytes'],'videoBytes':report['video']['sizeBytes'],'videoSha256':report['video']['sha256'],'publicFiles':public_files}),flush=True)
