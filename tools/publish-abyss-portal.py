"""Prepare a finished portal delivery; retain native static records and registration.

Explicit source only. No client writes, Art ID allocation or server installation.
"""
import csv, hashlib, importlib.util, io, json, struct, sys, zipfile
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('native', ROOT/'tools/publish-new-assets.py')
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)
SOURCE = Path(sys.argv[1])
GALLERY = ROOT/'public/gallery'
catalog_file = GALLERY/'catalog.js'
catalog = json.loads(catalog_file.read_text(encoding='utf-8')[15:-1])
ID = 'abyss-summoning-portal'
assert ID not in {x['id'] for x in catalog['items']}
public_files = set()

def decode_static(blob):
    header, w, h = struct.unpack_from('<IHH', blob)
    assert header == 1234 and 0 < w <= 512 and 0 < h <= 512
    assert len(blob) >= 8+2*h
    offsets = struct.unpack_from('<'+'H'*h, blob, 8)
    base, end = 8+2*h, 8+2*h
    pixels = np.zeros((h,w,4), dtype=np.uint8)
    for y, offset in enumerate(offsets):
        pos = base+2*offset
        assert pos == end
        x = 0
        while True:
            assert pos+4 <= len(blob)
            skip, count = struct.unpack_from('<HH', blob, pos); pos += 4
            if skip == count == 0: break
            x += skip
            assert count > 0 and x+count <= w and pos+count*2 <= len(blob)
            colors = np.frombuffer(blob, dtype='<u2', count=count, offset=pos)
            assert (colors < 0x8000).all()
            pixels[y,x:x+count,:3] = np.stack(((colors>>10)&31,(colors>>5)&31,colors&31),axis=1)*8
            pixels[y,x:x+count,3] = 255
            x += count; pos += count*2
        end = pos
    assert end == len(blob)
    return pixels

def media(suffix, blob):
    suffix = suffix.lower().replace('_','-')
    p = 'media/new-assets/'+ID+'-'+suffix
    (GALLERY/p).parent.mkdir(parents=True, exist_ok=True)
    (GALLERY/p).write_bytes(blob); public_files.add(p)
    return p

with zipfile.ZipFile(SOURCE) as source:
    assert source.testzip() is None
    base = 'UO_Abyss_Portal/'
    manifest = json.loads(source.read(base+'import_manifest.json'))
    csvrows = list(csv.DictReader(io.StringIO(source.read(base+'import_manifest.csv').decode().replace('\r',''))))
    assert len(manifest) == len(csvrows) == 136
    states = json.loads(source.read(base+'animation_states.json'))
    assert states['states']['active']['duration_ms'] is None
    assert states['states']['active']['automatic_exit'] is False
    assert states['monster_logic_included'] is False
    payload, frames, previews = {}, {}, []
    for name in ['active_animdata_template.json','animation_states.json','import_manifest.json','import_manifest.csv','validation.json']:
        payload[name] = source.read(base+name)
    for row, csvrow in zip(manifest,csvrows):
        assert row['png'] == csvrow['png'] and row['png_sha256'] == csvrow['png_sha256']
        assert row['target_art_id'] == csvrow['target_art_id'] == ''
        assert row['duration_ms'] == (100 if row['phase']=='active' else 80)
        assert row['loop'] == (row['phase']=='active')
        name = row['png']; blob = source.read(base+name)
        assert native.sha(blob) == row['png_sha256']
        im = native.image(blob); a = np.array(im)
        assert im.size == (row['canvas_width'],row['canvas_height'])
        assert row['placement_center_x'] == im.width//2 and row['canvas_bottom_y'] == im.height
        assert set(np.unique(a[:,:,3])) <= {0,255}
        assert not a[0,:,3].any() and not a[-1,:,3].any() and not a[:,0,3].any() and not a[:,-1,3].any()
        assert not (a[:,:,:3]%8).any()
        native_name = name.replace('/png/','/native_static_rle/').replace('.png','.bin')
        native_blob = source.read(base+native_name)
        assert np.array_equal(a, decode_static(native_blob))
        bmp_name = name.replace('/png/','/bmp/').replace('.png','.bmp')
        bmp_blob = source.read(base+bmp_name)
        b = np.array(native.image(bmp_blob))
        assert np.array_equal(b[:,:,:3],a[:,:,:3])
        assert np.array_equal(b[:,:,:3].any(axis=2),a[:,:,3]>0)
        assert row['transparent_terminal'] == (not bool(a[:,:,3].any()))
        for n,data in [(name,blob),(native_name,native_blob),(bmp_name,bmp_blob)]: payload[n]=data
        key = row['variant'],row['phase']
        seq = frames.setdefault(key,[]); assert row['frame'] == len(seq);seq.append(im)
    for variant in ['standard','large']:
        opening, active, closing = [frames[variant,phase] for phase in ['opening','active','closing']]
        assert [len(opening),len(active),len(closing)] == [24,24,20]
        assert opening[-1].tobytes() == active[0].tobytes() == closing[0].tobytes()
        assert not opening[0].getbbox() and not closing[-1].getbbox()
        for phase in ['opening','active','closing']:
            seq = frames[variant,phase]
            assert len({native.sha(im.tobytes()) for im in seq}) == len(seq)
            visible = []
            for im in seq:
                canvas = Image.new('RGB',im.size,'#161b20');canvas.paste(im,(0,0),im);visible.append(canvas)
            out = io.BytesIO()
            options = {'loop':0} if phase=='active' else {}
            visible[0].save(out,format='GIF',save_all=True,append_images=visible[1:],duration=100 if phase=='active' else 80,optimize=False,**options)
            blob = out.getvalue();payload[f'previews/{variant}-{phase}.gif']=blob
            previews.append({'label':variant.title()+' '+phase+' — native canvas; '+('indefinite loop' if phase=='active' else 'one-shot sequence'), 'file':media(variant+'-'+phase+'.gif',blob)})
    for name,label in [('opening_contact_sheet.png','Opening action board'),('active_contact_sheet.png','Active loop action board'),('closing_contact_sheet.png','Closing action board'),('Native_Size.png','Two native import sizes'),('UO_Abyss_Portal_Active.gif','Active state — repeats indefinitely (scaled preview)'),('UO_Abyss_Portal_Lifecycle.gif','Lifecycle — two example loops and an external close request')]:
        blob=source.read(base+'previews/'+name);payload['previews/'+name]=blob
        previews.append({'label':label,'file':media(name,blob)})
    thumbnail=media('thumbnail.png',native.png(frames['large','active'][0]))
    readme=source.read(base+'README.txt').decode().replace('\r','').split('SOURCE AND REBUILD')[0]
    payload['README.txt']=readme.encode()
    download=native.package('downloads/effects/'+ID+'.zip',payload);public_files.add(download['file'])
    with zipfile.ZipFile(GALLERY/download['file']) as checked:
        assert checked.testzip() is None
        sums=checked.read('SHA256SUMS.txt').decode().splitlines()
        for line in sums:
            digest,name=line.split('  ',1);assert native.sha(checked.read(name))==digest

notes='Obsidian and violet summoning-portal item art in standard and large sizes. Each size has 24 opening, 24 active-loop and 20 closing frames, with registered RGB555 PNGs, black-key BMPs and exact native static-art records. The active loop repeats indefinitely until an external script requests closing; the lifecycle GIF uses two example loops only. Art IDs and client animdata remain unassigned. No monsters, spawning scripts, collision, traversal or dynamic lighting are supplied. Opening and closing need external one-shot control; target-client behaviour is untested. Fixed canvas placement must be retained. These are static item-art records, not VD/mobile animation or complete MUL archives.'
catalog['items'].append({'id':ID,'name':'Abyss Summoning Portal','project':'Abyss-Portal','category':'Effects','kind':'effect','notes':notes,'directions':1,'previews':previews,'thumbnail':thumbnail,'download':{**download,'label':'136 native static records + PNG/BMP frames + state contract','status':'Item-art import and external script/client integration required'}})
catalog_file.write_text('window.GALLERY='+json.dumps(catalog,ensure_ascii=False,separators=(',',':'))+';',encoding='utf-8')
folder=ROOT/'data/release-assets/2026-10-03';mfile=folder/'manifest.json';release=json.loads(mfile.read_text(encoding='utf-8'))
assert not {f['path'] for f in release['files']}.intersection('gallery/'+p for p in public_files)
name=f"assets-{len(release['bundles'])+1:02}.zip";target=folder/name;assert not target.exists()
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for p in sorted(public_files):
        blob=(GALLERY/p).read_bytes();info=zipfile.ZipInfo('gallery/'+p,(2026,10,4,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,blob)
        release['files'].append({'path':'gallery/'+p,'bytes':len(blob),'sha256':native.sha(blob),'bundle':name})
blob=target.read_bytes();assert len(blob)<25*1024*1024
release['bundles'].append({'file':name,'bytes':len(blob),'sha256':native.sha(blob)})
assert sum(f['bytes'] for f in release['files']) <= 768*1024*1024
mfile.write_text(json.dumps(release,indent=2)+'\n',encoding='utf-8')
ignore=ROOT/'.gitignore';ignore.write_text(ignore.read_text(encoding='utf-8')+'\n# Finished Abyss portal release\n'+''.join('/public/gallery/'+p+'\n' for p in sorted(public_files)),encoding='utf-8')
audit={'sourceArchive':SOURCE.name,'sourceSha256':native.sha(SOURCE.read_bytes()),'pngBmpNativeTriplesChecked':136,'checksumEntriesChecked':len(sums),'states':{'opening':24,'active':24,'closing':20},'sizes':2,'clientRuntimeTested':False,'activeAutomaticExit':False,'publicFiles':len(public_files),'bundle':name,'nativeFilesIncluded':True,'sourcePromptsReferencesBuilderOmitted':True}
(ROOT/'data/abyss-portal-release.json').write_text(json.dumps(audit,indent=2)+'\n',encoding='utf-8')
print(json.dumps(audit))
