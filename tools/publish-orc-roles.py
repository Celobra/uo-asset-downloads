"""Prepare the finished five-role Orc delivery from an explicit source ZIP.

Retains native VD/records and registered PNGs; omits design references and prompts.
Appends immutable release bundles. Does not install or allocate game IDs.
"""
import csv, hashlib, importlib.util, inspect, io, json, math, struct, sys, zipfile
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('native', ROOT/'tools/publish-new-assets.py')
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)
decoder = inspect.getsource(native.decode_vd).replace('category in (0, 1)', 'category in (0, 1, 2)').replace('22 if category == 0 else 13', '{0:22, 1:13, 2:35}[category]')
exec(decoder, native.__dict__)
SOURCE = Path(sys.argv[1])
GALLERY = ROOT/'public/gallery'
catalog_file = GALLERY/'catalog.js'
catalog = json.loads(catalog_file.read_text(encoding='utf-8')[15:-1])
old_items = list(catalog['items'])
existing = set()
for item in old_items:
    with zipfile.ZipFile(GALLERY/item['download']['file']) as archive:
        existing.update(native.sha(archive.read(n)) for n in archive.namelist() if n.lower().endswith('.vd'))
with zipfile.ZipFile(GALLERY/'downloads/creatures/rideable-pack-mounts.zip') as archive:
    horse_blob = archive.read('Horse/Rideable-Pack-Horse.vd')
_, _, horse = native.decode_vd(horse_blob)
public_files, added = set(), []
audit = {'sourceArchive': SOURCE.name, 'sourceSha256': native.sha(SOURCE.read_bytes()), 'nativeVDs': [], 'nativeFramesVerified': 0, 'nativeRecordsVerified': 0, 'pngFramesVerified': 0, 'checksumMembersVerified': 0, 'clientRuntimeTested': False, 'riderPreviewReference': {'listing': 'pack-horse', 'vdSha256': native.sha(horse_blob), 'includedAsDownload': False}}

def media(id, suffix, blob):
    path = 'media/new-assets/'+id+'-'+suffix
    (GALLERY/path).parent.mkdir(parents=True, exist_ok=True)
    (GALLERY/path).write_bytes(blob)
    public_files.add(path)
    return path

def gif(frames, duration=130):
    stream = io.BytesIO()
    frames[0].save(stream, format='GIF', save_all=True, append_images=frames[1:], duration=duration, loop=0, optimize=False)
    return stream.getvalue()

def pose(im, cx, cy, vw, vh, ox, oy):
    assert 0 <= ox-cx and ox-cx+im.width <= vw and 0 <= oy-im.height-cy and oy-cy <= vh
    canvas = Image.new('RGB', (vw,vh), '#161b20')
    canvas.paste(im, (ox-cx,oy-im.height-cy), im)
    return canvas

with zipfile.ZipFile(SOURCE) as archive:
    assert archive.testzip() is None
    base = 'UO_Orcs_5_Roles/'
    pack = json.loads(archive.read(base+'pack_manifest.json'))
    assert pack['races'] == ['orc'] and pack['bodies'] == 5
    layout_blob = archive.read(base+'human_action_layout.csv')
    layout = list(csv.DictReader(io.StringIO(layout_blob.decode().replace('\r',''))))
    assert [int(x['slot']) for x in layout] == list(range(35))
    for role in pack['roles']:
        id = 'orc-role-'+role
        folder = base+'races/orc/'+role+'/'
        body = json.loads(archive.read(folder+'body.json'))
        vd = archive.read(folder+'orc_'+role+'.vd')
        assert native.sha(vd) not in existing and id not in {i['id'] for i in catalog['items']}
        category, capacity, decoded = native.decode_vd(vd)
        assert category == 2 and capacity == 35 and len(decoded) == 175
        payload = {n[len(folder):]:archive.read(n) for n in archive.namelist() if n.startswith(folder) and not n.endswith('/')}
        payload['human_action_layout.csv'] = layout_blob
        sequences = {}
        for action in range(35):
            for direction in range(8):
                prefix = f'png/Action_{action:02}/Direction_{direction}/'
                metadata = json.loads(payload[prefix+'frames.json'])
                seq = []
                assert len(metadata['frames']) == int(layout[action]['frames_per_direction'])
                for frame in metadata['frames']:
                    im = native.image(payload[prefix+frame['file']])
                    assert im.size == (192,192) and frame['root'] == [96,142]
                    assert set(im.getchannel('A').getdata()) <= {0,255}
                    assert im.getbbox() and not any(im.getchannel('A').crop(b).getbbox() for b in [(0,0,192,1),(0,191,192,192),(0,0,1,192),(191,0,192,192)])
                    crop = im.crop((frame['paste_x'],frame['paste_y'],frame['paste_x']+frame['width'],frame['paste_y']+frame['height']))
                    assert frame['paste_x'] == 96-frame['center_x']
                    assert frame['paste_y'] == 142-frame['height']-frame['center_y']
                    seq.append((crop,frame['center_x'],frame['center_y']))
                    audit['pngFramesVerified'] += 1
                sequences[action,direction] = seq
                if direction < 5:
                    assert len(decoded[action,direction]) == len(seq)
                    slot = action*5+direction
                    lookup,length,_ = struct.unpack_from('<iii',vd,4+slot*12)
                    assert payload[f'native_animation/Action_{action:02}/Direction_{direction}.bin'] == vd[lookup:lookup+length]
                    audit['nativeRecordsVerified'] += 1
                    for native_frame, png_frame in zip(decoded[action,direction],seq):
                        assert native_frame[1:] == png_frame[1:] and native_frame[0].size == png_frame[0].size
                        a,b = native.np.array(native_frame[0]),native.np.array(png_frame[0])
                        assert native.np.array_equal(a[:,:,3],b[:,:,3])
                        visible = a[:,:,3] > 0
                        assert native.np.array_equal(a[:,:,:3][visible]>>3,b[:,:,:3][visible]>>3)
                        audit['nativeFramesVerified'] += 1
                else:
                    for shown, original in zip(seq,sequences[action,8-direction]):
                        assert shown[1:] == (original[0].width-original[1],original[2])
                        assert shown[0].tobytes() == original[0].transpose(Image.Transpose.FLIP_LEFT_RIGHT).tobytes()
        assert sum(len(s) for s in decoded.values()) == body['stored_frames'] == 1050
        stored = {g:s for g,s in sequences.items() if g[1]<5}
        vw = math.ceil((max(max(cx,im.width-cx) for seq in stored.values() for im,cx,cy in seq)+16)/8)*16
        ox = vw//2
        oy = math.ceil((max(im.height+cy for seq in stored.values() for im,cx,cy in seq)+16)/8)*8
        vh = math.ceil((oy+max(-cy for seq in stored.values() for im,cx,cy in seq)+16)/8)*8
        tile = math.ceil(max(max(im.size) for seq in stored.values() for im,cx,cy in seq)/8)*8
        sheet = Image.new('RGBA',(tile*16,tile*math.ceil(1050/16)))
        board = Image.new('RGB',(vw*5,(vh+20)*35),'#161b20')
        draw = ImageDraw.Draw(board)
        groups,previews,labels,index = [],[],[x['action'] for x in layout],0
        for action in range(35):
            for direction in range(5):
                group=[]
                for im,cx,cy in stored[action,direction]:
                    sheet.paste(im,((index%16)*tile,(index//16)*tile))
                    group.append([index,im.width,im.height,cx,cy]);index+=1
                groups.append(group)
                board.paste(pose(*stored[action,direction][0],vw,vh,ox,oy),(direction*vw,action*(vh+20)+20))
            draw.text((8,action*(vh+20)+3),labels[action],fill='#ded8b7')
            frames=[pose(*frame,vw,vh,ox,oy) for frame in stored[action,1]]
            blob=gif(frames)
            payload[f'animations/Action_{action:02}.gif']=blob
            previews.append({'label':labels[action]+' - full source sequence','file':media(id,f'action-{action:02}.gif',blob)})
        assert index == 1050
        previews.append({'label':'All 35 actions - five stored views','file':media(id,'all-actions.png',native.png(board))})
        facing=Image.new('RGB',(vw*8,vh),'#161b20')
        for direction in range(8): facing.paste(pose(*sequences[4,direction][0],vw,vh,ox,oy),(direction*vw,0))
        previews.append({'label':'Eight native-size facings','file':media(id,'eight-directions.png',native.png(facing))})
        payload['eight_directions.png']=native.png(facing)
        # Compare registered seated poses against an already public custom mount.
        # This is illustrative fitting evidence, not a client mount-routing test.
        for action in range(23,30):
            frames=[]
            horse_action={23:0,24:1}.get(action,2)
            for f in range(len(stored[action,1])):
                canvas=pose(*horse[horse_action,1][f%len(horse[horse_action,1])],192,192,96,142)
                im,cx,cy=stored[action,1][f]
                canvas.paste(im,(96-cx,142-im.height-cy),im)
                frames.append(canvas)
            previews.append({'label':labels[action]+' - Pack Horse fit comparison (offline)','file':media(id,f'mounted-fit-{action:02}.gif',gif(frames))})
        thumbnail=media(id,'thumbnail.png',native.png(pose(*stored[4,1][0],vw,vh,ox,oy)))
        atlas='sheets/'+id+'.png';(GALLERY/atlas).write_bytes(native.png(sheet));public_files.add(atlas)
        motion={'parts':[{'file':atlas,'tile':tile,'columns':16,'groups':groups}],'bodies':None,'viewport':[vw,vh,ox,oy],'actions':labels,'nativeActionIds':list(range(35)),'frameMs':130}
        motion_file=media(id,'motion.js',('window.MOTION=window.MOTION||{};window.MOTION['+json.dumps(id)+']='+json.dumps(motion,separators=(',',':'))+';\n').encode())
        notes='Original Orc NPC geometry with a baked-in '+role+' outfit. All 35 humanoid actions, including seven mounted slots; 1,050 stored native frames and 1,680 registered PNG frames across eight views. Empty hands and joint anchors supplied. Visual role only: equipment fitting, hair, paperdolls, vendor/AI/spell rules and target-client mounting require separate integration. No game IDs allocated; client runtime not tested. Pack Horse fitting GIFs are offline comparisons; mount artwork is not included as a game file.'
        payload['README.md']=('# '+body['name']+'\n\n'+notes+'\n\nImport the unchanged type-2 / version-6 VD into an unused compatible humanoid animation slot. Keep PNG canvas padding, frames.json registration and joint anchors. Individual native_animation BIN files are animation records, not complete MUL archives. Outfit and ornaments are baked into the body; existing human equipment is not automatically fitted. Configure client body mapping and server classification for your own target. Validate animations, seating, draw order and equipment in game before deployment. GIF timing is illustrative. Source prompts, client references and the unrelated four-race overview are omitted.\n').encode()
        download=native.package('downloads/creatures/'+id+'.zip',payload)
        public_files.add(download['file'])
        with zipfile.ZipFile(GALLERY/download['file']) as checked:
            assert checked.testzip() is None
            for line in checked.read('SHA256SUMS.txt').decode().splitlines():
                digest,name=line.split('  ',1);assert native.sha(checked.read(name))==digest;audit['checksumMembersVerified']+=1
            assert checked.read('orc_'+role+'.vd')==vd
        catalog['items'].append({'id':id,'name':body['name'],'project':'Orc-NPC-Roles','category':'Creatures and mounts','kind':'motion','notes':notes,'actions':35,'directions':8,'previews':previews,'thumbnail':thumbnail,'motion':motion_file,'download':{**download,'label':'VD + registered PNGs + native records','status':'Import, equipment fitting and target-client checks required'}})
        added.append(id);audit['nativeVDs'].append({'id':id,'sha256':native.sha(vd)})
        print('Prepared',id,flush=True)
assert audit['nativeFramesVerified']==5250 and audit['pngFramesVerified']==8400 and audit['nativeRecordsVerified']==875
assert catalog['items'][:len(old_items)]==old_items
catalog_file.write_text('window.GALLERY='+json.dumps(catalog,ensure_ascii=False,separators=(',',':'))+';',encoding='utf-8')
release_folder=ROOT/'data/release-assets/2026-10-03'
manifest_file=release_folder/'manifest.json';release=json.loads(manifest_file.read_text())
assert not {f['path'] for f in release['files']}.intersection('gallery/'+p for p in public_files)
parts=[[]];size=0
for p in sorted(public_files):
    blob=(GALLERY/p).read_bytes()
    if size+len(blob)>18*1024*1024 and parts[-1]:parts.append([]);size=0
    parts[-1].append(('gallery/'+p,blob));size+=len(blob)
start=len(release['bundles'])+1
for i,part in enumerate(parts,start):
    name=f'assets-{i:02}.zip';target=release_folder/name;assert not target.exists()
    with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
        for p,blob in part:
            info=zipfile.ZipInfo(p,(2026,10,9,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;archive.writestr(info,blob)
            release['files'].append({'path':p,'bytes':len(blob),'sha256':native.sha(blob),'bundle':name})
    blob=target.read_bytes();assert len(blob)<25*1024*1024
    release['bundles'].append({'file':name,'bytes':len(blob),'sha256':native.sha(blob)})
assert sum(f['bytes'] for f in release['files']) <= 768*1024*1024
manifest_file.write_text(json.dumps(release,indent=2)+'\n',encoding='utf-8')
ignore=ROOT/'.gitignore';ignore.write_text(ignore.read_text(encoding='utf-8')+'\n# October 9 Orc role release\n'+''.join('/public/gallery/'+p+'\n' for p in sorted(public_files)),encoding='utf-8')
audit.update(date='2026-10-09',items=added,publicFiles=len(public_files),bundleStart=start,bundles=len(parts))
(ROOT/'data/orc-roles-release.json').write_text(json.dumps(audit,indent=2)+'\n',encoding='utf-8')
print(json.dumps(audit),flush=True)
