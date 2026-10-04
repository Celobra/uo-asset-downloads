"""Prepare explicit finished archive inputs; preserve originals and native pixels.

Usage: python tools/publish-oct3-packs.py DIRECTORY_CONTAINING_APPROVED_ZIPS
This release appends to the existing October 3 manifest without rewriting its bundles.
"""
import sys, json, io, math, hashlib, zipfile, re, inspect
from pathlib import Path
from PIL import Image, ImageDraw
import importlib.util

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('native', ROOT/'tools/publish-new-assets.py')
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)
# Humanoid VDs use the same bounded native record layout with 35 action slots.
decoder = inspect.getsource(native.decode_vd).replace('category in (0, 1)', 'category in (0, 1, 2)').replace('22 if category == 0 else 13', '{0:22, 1:13, 2:35}[category]')
exec(decoder, native.__dict__)
SOURCE = Path(sys.argv[1])
GALLERY = ROOT/'public/gallery'
MEDIA = GALLERY/'media/new-assets'
MEDIA.mkdir(parents=True, exist_ok=True)
catalog_file = GALLERY/'catalog.js'
catalog = json.loads(catalog_file.read_text(encoding='utf-8')[15:-1])
old_items = list(catalog['items'])
existing_vd = set()
for item in old_items:
    p = GALLERY/item['download']['file']
    if p.exists():
        with zipfile.ZipFile(p) as z:
            existing_vd.update(native.sha(z.read(n)) for n in z.namelist() if n.lower().endswith('.vd'))
added, public_files, audit = [], set(), {'sources': [], 'vdFramesVerified': 0, 'pngFramesVerified': 0}

def media(id, suffix, blob):
    name = 'media/new-assets/'+id+'-'+suffix
    (GALLERY/name).write_bytes(blob)
    public_files.add(name)
    return name

def clean_json(blob):
    value = json.loads(blob)
    def clean(v):
        if isinstance(v, dict):
            return {k:clean(x) for k,x in v.items() if k not in ('workspaceRoot','source_path','absolute_path')}
        if isinstance(v, list): return [clean(x) for x in v]
        return v
    return (json.dumps(clean(value), ensure_ascii=False, indent=2)+'\n').encode('utf-8')

def add(item, payload):
    assert item['id'] not in {x['id'] for x in catalog['items']}
    download = native.package('downloads/'+('creatures' if item['kind']=='motion' else 'world')+'/'+item['id']+'.zip', payload)
    item['download'] = {**download, 'label': item.pop('downloadLabel'), 'status': 'Import and target-client checks required'}
    public_files.add(download['file'])
    catalog['items'].append(item)
    added.append(item['id'])

for archive, collection, subtree, prefix in [
    ('UO_DnD_Monsters_15.zip','DnD-Palette-Bestiary','creatures','dnd-palette'),
    ('UO_Fantasy_Races.zip','Fantasy-Races','races','fantasy-race')]:
    path = SOURCE/archive
    audit['sources'].append({'archive':archive,'sha256':native.sha(path.read_bytes())})
    with zipfile.ZipFile(path) as z:
        base = archive[:-4]+'/'
        manifest = json.loads(z.read(base+'manifest.json'))
        readme = z.read(base+'README.md').decode('utf-8').replace('\r','')
        for entry in manifest:
            key = entry['key']; id = prefix+'-'+key.replace('_','-')
            body_root = base+subtree+'/'+key+'/'
            vd = z.read(base+entry['vd_file']) if entry.get('vd_file') else None
            if vd and native.sha(vd) in existing_vd: continue
            payload = {n[len(body_root):]:clean_json(z.read(n)) if n.endswith('.json') else z.read(n)
                       for n in z.namelist() if n.startswith(body_root) and not n.endswith('/')}
            if vd: payload[key+'.vd'] = vd
            payload['body.json'] = clean_json(json.dumps(entry).encode())
            payload['README.md'] = ('# '+entry['name']+'\n\nSelected body from '+collection+'.\n\n'+readme).encode('utf-8')
            payload['IMPORT.md'] = ('Import the exact VD where supplied into an unused compatible body slot. PNG-only bodies require a compatible animation encoder and action mapping; no VD is supplied for these bodies. Keep frames.json and canvas padding with PNG frames. These are palette variants of existing UO anatomy. Equipment, paperdolls, abilities, shard definitions and occupied body IDs are not supplied. Test on your own target client.\n').encode()
            sequences = {}
            total_png = 0
            for action in entry['actions']:
                for direction in range(8):
                    folder = f'frames/Action_{action:02}/Direction_{direction}/'
                    metadata = json.loads(payload[folder+'frames.json'])
                    seq = []
                    for frame in metadata['frames']:
                        blob = payload[folder+frame['file']]
                        im = native.image(blob)
                        assert im.size == (frame['png_width'], frame['png_height'])
                        assert set(im.getchannel('A').getdata()) <= {0,255}
                        crop = im.crop((frame['paste_x'], frame['paste_y'], frame['paste_x']+frame['width'], frame['paste_y']+frame['height']))
                        seq.append((crop,frame['center_x'],frame['center_y']))
                        total_png += 1
                    sequences[action,direction] = seq
            assert total_png == entry['frames']
            audit['pngFramesVerified'] += total_png
            if vd:
                category, capacity, decoded = native.decode_vd(vd)
                assert capacity == entry['vd_action_capacity']
                assert set(decoded) == {(a,d) for a in entry['actions'] for d in range(5)}
                for group, seq in decoded.items():
                    assert len(seq)==len(sequences[group])
                    for original, published in zip(seq,sequences[group]):
                        assert original[1:]==published[1:]
                        assert original[0].size==published[0].size
                        a,b=native.np.array(original[0]),native.np.array(published[0])
                        assert native.np.array_equal(a[:,:,3],b[:,:,3])
                        visible=a[:,:,3]>0
                        assert native.np.array_equal(a[:,:,:3][visible]>>3,b[:,:,:3][visible]>>3)
                        audit['vdFramesVerified'] += 1
            stored = {g:s for g,s in sequences.items() if g[1]<5}
            ox = math.ceil((max(cx for seq in stored.values() for im,cx,cy in seq)+16)/8)*8
            right = max(im.width-cx for seq in stored.values() for im,cx,cy in seq)+16
            oy = math.ceil((max(im.height+cy for seq in stored.values() for im,cx,cy in seq)+16)/8)*8
            bottom = max(-cy for seq in stored.values() for im,cx,cy in seq)+16
            vw, vh = math.ceil(max(ox,right)/8)*16, math.ceil((oy+bottom)/8)*8
            ox=vw//2
            tile = math.ceil(max(max(im.size) for seq in stored.values() for im,cx,cy in seq)/8)*8
            frame_total = sum(len(s) for s in stored.values())
            sheet = Image.new('RGBA',(tile*16,tile*math.ceil(frame_total/16)))
            groups, previews, labels = [], [], []
            board = Image.new('RGB',(vw*5,(vh+20)*len(entry['actions'])),'#161b20'); draw=ImageDraw.Draw(board)
            index = 0
            for row, action in enumerate(entry['actions']):
                label = ('Walk' if action==0 else 'Stand' if action==1 and entry.get('vd_action_capacity')==22 else 'Action '+str(action))
                labels.append(label)
                for direction in range(5):
                    group=[]
                    for im,cx,cy in stored[action,direction]:
                        sheet.paste(im,((index%16)*tile,(index//16)*tile))
                        group.append([index,im.width,im.height,cx,cy]);index+=1
                    groups.append(group)
                    im,cx,cy=stored[action,direction][0]
                    board.paste(im,(direction*vw+ox-cx,row*(vh+20)+20+oy-im.height-cy),im)
                draw.text((8,row*(vh+20)+3),label,fill='#ded8b7')
                gif_name=f'animations/Action_{action:02}.gif'
                if gif_name not in payload:
                    frames=[]
                    for im,cx,cy in stored[action,1]:
                        canvas=Image.new('RGB',(vw,vh),'#161b20');canvas.paste(im,(ox-cx,oy-im.height-cy),im);frames.append(canvas)
                    stream=io.BytesIO();frames[0].save(stream,format='GIF',save_all=True,append_images=frames[1:],duration=130,loop=0,optimize=False)
                    payload[gif_name]=stream.getvalue()
                previews.append({'label':label+' — full source sequence','file':media(id,f'action-{action:02}.gif',payload[gif_name])})
            assert index == frame_total
            previews.append({'label':'Every source action — five stored views','file':media(id,'all-actions.png',native.png(board))})
            if 'eight_directions.png' not in payload:
                facing=Image.new('RGB',(vw*8,vh),'#161b20')
                for direction in range(8):
                    im,cx,cy=sequences[entry['actions'][0],direction][0]
                    facing.paste(im,(direction*vw+ox-cx,oy-im.height-cy),im)
                payload['eight_directions.png']=native.png(facing)
            previews.append({'label':'Eight native-size facings','file':media(id,'eight-directions.png',payload['eight_directions.png'])})
            thumbnail=media(id,'thumbnail.png',native.png(board.crop((vw,20,vw*2,20+vh))))
            atlas_name='sheets/'+id+'.png';(GALLERY/atlas_name).write_bytes(native.png(sheet));public_files.add(atlas_name)
            motion={'parts':[{'file':atlas_name,'tile':tile,'columns':16,'groups':groups}], 'bodies':None,'viewport':[vw,vh,ox,oy],'actions':labels,'nativeActionIds':entry['actions'],'frameMs':130}
            motion_file=media(id,'motion.js',('window.MOTION=window.MOTION||{};window.MOTION['+json.dumps(id)+']='+json.dumps(motion,separators=(',',':'))+';\n').encode())
            notes=f"{entry['frames']:,} PNG frames; {len(entry['actions'])} source actions and eight views. Palette adaptation of existing UO anatomy. {entry['note']} "
            notes += 'Exact native VD retained. ' if vd else 'PNG + registration metadata only; no VD. Source UOP action IDs require target-format mapping. '
            if entry.get('vd_action_capacity')==35: notes+='Base body only: hair, equipment and paperdolls are separate. '
            notes+='No gameplay abilities or body-ID allocation; client/shard integration remains.'
            add({'id':id,'name':entry['name'],'project':collection,'category':'Creatures and mounts','kind':'motion','notes':notes,'actions':len(entry['actions']),'directions':8,'previews':previews,'thumbnail':thumbnail,'motion':motion_file,'downloadLabel':'VD + registered PNG frames' if vd else 'PNG frames + registration metadata'},payload)
            print('Prepared',id,flush=True)

world = [
 ('UO_Terrain_Pack.zip','uo-terrain-pack','Terrain-Pack','Terrain tiles and textures','256 land tiles, matching square textures and 14 corner-mask transitions per material pair. Static water/lava; IDs and movement rules unassigned.'),
 ('UO_Rock_Surfaces.zip','uo-rock-surfaces','Rock-Surfaces','Rock surfaces — eight styles','64 sprites in two mirrored facings. Variable-size scenery: joins and footprints are not an exact seamless tile system.'),
 ('UO_Scaffolding_Metal_and_Wood.zip','uo-scaffolding','Scaffolding','Metal and wood scaffolding','62 pieces, 20-Z lifts and native-grid layout examples. Platform metadata is supplied; ladders and collision need target-server setup.'),
 ('UO_Wilderness_Biomes_96.zip','uo-wilderness-biomes','Wilderness-Biomes','Wilderness biomes — 96 decorations','96 native-size decorations across eight biomes, with family sheets and scene previews. Static scenery; no swimming, damage or seamless-shore behavior.'),
 ('UO_Underwater_96.zip','uo-underwater','Underwater','Underwater — 96 decorations','96 native-size reef, coral, shell, barnacle, kelp, seagrass, sponge and seabed sprites. Static scenery; no underwater renderer or swimming rules.'),
 ('UO_Boatyard.zip','uo-boatyard','Boatyard','Boatyard — ship construction','189 pieces and 14 layouts: framed/fitted 16-tile hulls, yard props and ropes. Includes the 62 scaffold pieces unchanged. Decorative fixed hulls; boats, hoists, ladders and collision are not implemented.')]
for archive,id,collection,name,notes in world:
    path=SOURCE/archive;audit['sources'].append({'archive':archive,'sha256':native.sha(path.read_bytes())})
    with zipfile.ZipFile(path) as z:
        base='' if archive=='UO_Rock_Surfaces.zip' else archive[:-4]+'/'
        payload={}
        previews=[]
        for full in z.namelist():
            if full.endswith('/'):continue
            relative=full[len(base):]
            if relative.split('/')[0] in ('build_sources','source','source_png','assembly_reference'):continue
            if relative in ('source_manifest.json','reference_dimensions.json'):continue
            if relative.endswith('.py'):continue
            blob=z.read(full)
            if relative.endswith('.json'):blob=clean_json(blob)
            native.assert_public(relative,blob)
            payload[relative]=blob
            if relative.endswith('.png') and (relative.startswith('previews/') or '/' not in relative) and 'original_scale' not in relative:
                suffix=re.sub('[^a-z0-9.-]','-',relative.lower())
                previews.append({'label':Path(relative).stem.replace('_',' '),'file':media(id,suffix,blob)})
        manifest=json.loads(payload['manifest.json'])
        for entry in manifest:
            p=entry.get('png') or entry.get('land_png')
            if not p and ('material' in entry or 'group' in entry):
                p='png/'+entry.get('material',entry.get('group'))+'/'+entry['name']+'.png'
            if p:
                assert p in payload, p
                digest=entry.get('sha256_png') or entry.get('sha256_land_png') or entry.get('png_sha256')
                if digest:assert native.sha(payload[p])==digest
                im=native.image(payload[p]);assert set(im.getchannel('A').getdata()) <= {0,255}
        payload['IMPORT-NOTES.md']=(notes+'\n\nImport only individual native-size PNG/BMP files. Preserve padding and allocate unused IDs. Individual .bin records are not complete MUL archives. Preview compositions are offline views. Check tiledata, sorting, movement and collision in your target client.\n').encode()
        assert previews
        thumb=next((p['file'] for p in previews if 'preview' in p['file']),previews[0]['file'])
        add({'id':id,'name':name,'project':collection,'category':'World and items','kind':'still','notes':notes+' PNG, BMP, native records, manifests and import notes included. Offline format checks; in-client integration remains.','directions':2 if archive in ('UO_Rock_Surfaces.zip','UO_Boatyard.zip') else 1,'previews':previews,'thumbnail':thumb,'downloadLabel':'Native art + manifests + import notes'},payload)
        print('Prepared',id,flush=True)

assert catalog['items'][:len(old_items)]==old_items
catalog_file.write_text('window.GALLERY='+json.dumps(catalog,ensure_ascii=False,separators=(',',':'))+';',encoding='utf-8')
release_folder=ROOT/'data/release-assets/2026-10-03'
manifest_file=release_folder/'manifest.json'
release=json.loads(manifest_file.read_text(encoding='utf-8'))
old_paths={f['path'] for f in release['files']}
assert not old_paths.intersection('gallery/'+p for p in public_files)
parts=[[]];size=0
for p in sorted(public_files):
    blob=(GALLERY/p).read_bytes()
    if size+len(blob)>18*1024*1024 and parts[-1]:parts.append([]);size=0
    parts[-1].append(('gallery/'+p,blob));size+=len(blob)
start=len(release['bundles'])+1
for i,part in enumerate(parts,start):
    name=f'assets-{i:02}.zip';target=release_folder/name;assert not target.exists()
    with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for p,blob in part:
            info=zipfile.ZipInfo(p,(2026,10,3,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,blob)
            release['files'].append({'path':p,'bytes':len(blob),'sha256':native.sha(blob),'bundle':name})
    blob=target.read_bytes();assert len(blob)<25*1024*1024
    release['bundles'].append({'file':name,'bytes':len(blob),'sha256':native.sha(blob)})
assert sum(f['bytes'] for f in release['files'])<=768*1024*1024
manifest_file.write_text(json.dumps(release,indent=2)+'\n',encoding='utf-8')
ignore=ROOT/'.gitignore';ignore.write_text(ignore.read_text(encoding='utf-8')+'\n# October 3 evening publication\n'+''.join('/public/gallery/'+p+'\n' for p in sorted(public_files)),encoding='utf-8')
audit.update({'date':'2026-10-03','items':added,'files':len(public_files),'newBundles':len(parts),'bundleStart':start})
(ROOT/'data/oct3-packs-release.json').write_text(json.dumps(audit,indent=2)+'\n',encoding='utf-8')
print(json.dumps(audit),flush=True)
