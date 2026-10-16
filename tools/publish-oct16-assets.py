"""Curate explicit completed artwork archives without changing the originals.

Usage: python tools/publish-oct16-assets.py APPROVED_ASSET_DIRECTORY
Only runtime exports and public import documentation enter the dated bundles.
"""
import csv, hashlib, importlib.util, inspect, io, json, math, re, struct, sys, zipfile
from collections import defaultdict
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(sys.argv[1])
GALLERY = ROOT/'public/gallery'
spec = importlib.util.spec_from_file_location('native',ROOT/'tools/publish-new-assets.py')
native = importlib.util.module_from_spec(spec);spec.loader.exec_module(native)
decoder = inspect.getsource(native.decode_vd).replace('category in (0, 1)','category in (0, 1, 2)').replace('22 if category == 0 else 13','{0:22, 1:13, 2:35}[category]')
exec(decoder,native.__dict__)
catalog_path=GALLERY/'catalog.js'
catalog=json.loads(catalog_path.read_text(encoding='utf-8')[15:-1])
old=list(catalog['items']); ids={i['id'] for i in old}
files=set(); added=[]; sources=[]; evidence=[]
counts={'nativeStaticRecords':0,'nativeLandRecords':0,'nativeAnimationFrames':0,'pngAnimationFrames':0}

def digest(blob): return hashlib.sha256(blob).hexdigest()
def slug(value): return re.sub('[^a-z0-9]+','-',value.lower()).strip('-')
def clean_json(blob):
    value=json.loads(blob)
    def clean(v):
        if isinstance(v,dict): return {k:clean(x) for k,x in v.items() if not re.search('source_path|workspace|absolute_path|source_archive|source_reference|reference_archive',k,re.I)}
        if isinstance(v,list): return [clean(x) for x in v]
        if isinstance(v,str) and re.search(r'[A-Za-z]:[\\/]|Users[\\/]|My Drive',v):return 'Local compatible UO reference (not distributed)'
        return v
    return (json.dumps(clean(value),ensure_ascii=False,indent=2)+'\n').encode()

def open_source(name):
    path=SOURCE/name
    sources.append({'archive':name,'bytes':path.stat().st_size,'sha256':digest(path.read_bytes())})
    z=zipfile.ZipFile(path);assert z.testzip() is None
    return z

def media(id,suffix,blob):
    key='media/new-assets/'+id+'-'+slug(Path(suffix).stem)+Path(suffix).suffix.lower()
    target=GALLERY/key;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(blob)
    assert len(blob)<=25*1024*1024
    files.add(key);return key

def public_payload(z,base,extra_roots=()):
    payload={}
    for name in z.namelist():
        if name.endswith('/') or not name.startswith(base):continue
        key=name[len(base):];parts=key.lower().split('/')
        if any(p in {'build_sources','source','source_sheets','source_png','references','reference','assembly_reference','artwork'} for p in parts):continue
        if key.endswith(('.py','.cs','.txt','.md')) or re.search('source_|reference_|validation|loop_checks|extraction',key,re.I):continue
        if not key.endswith(('.png','.bmp','.bin','.vd','.csv','.json','.gif','.scp')):continue
        blob=z.read(name)
        if key.endswith('.json'):blob=clean_json(blob)
        if key.endswith(('.csv','.scp')):
            text=blob.decode('utf-8-sig')
            text=re.sub(r'[A-Za-z]:[\\/][^\r\n\",]+','your compatible UO reference folder',text)
            blob=text.encode()
        native.assert_public(key,blob)
        payload[key]=blob
    return payload

def decode_static(blob):
    header,w,h=struct.unpack_from('<IHH',blob)
    assert header in (0,1234) and 0<w<=1024 and 0<h<=1024
    offsets=struct.unpack_from('<'+'H'*h,blob,8);base=8+2*h;end=base
    pixels=np.zeros((h,w,4),dtype=np.uint8)
    for y,off in enumerate(offsets):
        pos=base+2*off;assert pos==end;x=0
        while True:
            skip,n=struct.unpack_from('<HH',blob,pos);pos+=4
            if skip==n==0:break
            x+=skip;assert n>0 and x+n<=w and pos+2*n<=len(blob)
            c=np.frombuffer(blob,dtype='<u2',count=n,offset=pos);assert (c<0x8000).all()
            pixels[y,x:x+n,:3]=np.stack(((c>>10)&31,(c>>5)&31,c&31),axis=1)*8
            pixels[y,x:x+n,3]=255;x+=n;pos+=2*n
        end=pos
    assert end==len(blob)
    return pixels

def verify_static(payload):
    for key,blob in payload.items():
        if not any('/'+p+'/' in '/'+key for p in ('native_static_rle','static_rle')) or not key.endswith('.bin'):continue
        png=key.replace('native_static_rle/','png/').replace('static_rle/','png/').removesuffix('.bin')+'.png'
        assert png in payload,(key,png)
        a=np.array(native.image(payload[png]));b=decode_static(blob)
        assert np.array_equal(a,b),(key,'native pixels')
        counts['nativeStaticRecords']+=1
    for key,blob in payload.items():
        if '/land_records/' not in '/'+key or not key.endswith('.land.bin'):continue
        png=key.replace('land_records/','land_png/').removesuffix('.land.bin')+'.png'
        if png not in payload:continue
        a=np.array(native.image(payload[png]));assert a.shape==(44,44,4) and len(blob)==2024
        colors=np.frombuffer(blob,dtype='<u2');cursor=0
        for y in range(44):
            n=2*(y+1) if y<22 else 2*(44-y);x=(44-n)//2
            row=colors[cursor:cursor+n];cursor+=n
            rgb=np.stack(((row>>10)&31,(row>>5)&31,row&31),axis=1)*8
            assert np.array_equal(a[y,x:x+n,:3]>>3,rgb>>3) and (a[y,x:x+n,3]==255).all()
        assert cursor==1012
        counts['nativeLandRecords']+=1

def public_readme(id,name,notes):
    text=name+'\n\n'+notes+'\n\nImport individual native-size files, keeping transparent padding and registration. Choose unused compatible IDs in your own client. Individual BIN records are not complete MUL archives. Preview scenes and timing are illustrative. Check mapping, flags, collision, sorting and gameplay in an isolated target installation. No installed game files, account data or reserved IDs are supplied.\n'
    if id.startswith('moving-terrain-'):
        text+='\nMOVING TERRAIN IMPORT\nEach material contains four loops (A, B, C, D), 32 frames each. Reserve 128 unused static IDs for this material and assign a contiguous 32-ID range to each loop. Map frames 00..31 in their original order. Only frame 00 is placed in the world.\n\nanimations.json lists the source-relative base offsets. For this individual material, subtract the smallest relative_base_art_id from all source-relative IDs before adding your chosen new starting ID. Use frames.csv for exact PNG/BMP/static-record correspondence. Its original relative_art_id values use the complete nine-material source pack, not a preallocated destination.\n\nThe 68-byte animdata_records are individual entries: FrameData offsets 0..31, FrameCount 32, FrameInterval 1, FrameStart 0, Unknown 0. The nominal preview delay is 100 ms per frame. Configure only base frame 00 with Animation (0x01000000). Set the flags and height recorded in animations.json for your target. Do not replace your complete MUL files with these individual entries.\n\nTile arrangement: even local X/even local Y = A; odd X/even Y = B; even X/odd Y = C; odd X/odd Y = D. Repeat the two-by-two block with the same interval and phase. These are flat animated static surfaces, not slope-conforming land textures or shore transitions. Water/lava movement, swimming and damage are separate server rules.\n\nImport into working copies through your usual UOFiddler workflow. If your client uses ArtLegacyMUL.uop, repack the matching art through that workflow. Distribute matching art/index, AnimData and TileData together after target-client checks. No automatic importer is bundled with these individually split materials.\n'
    if id=='uo-roaming-library-books':
        text+='\nSPHERE X EXAMPLE\nThe script has not been run on a Sphere server. Load sphere_x/library_book_roaming.scp through an isolated shard script list only after importing unused compatible body slots and configuring ambient NPC definitions. Target the configured non-player book with .x.f_library_book_start 3 (radius 1..12 tiles). .x.f_library_book_stop removes the example event and restores its saved NPC/home settings. Check bounds, obstacles, floor, effects and ordinary-player interaction before use. It is an ambient X-only example, not a validated production NPC system.\n'
    return text.encode()

def add(id,name,project,notes,payload,previews,motion=None,actions=None,category='World and items'):
    assert id not in ids;ids.add(id)
    payload['IMPORT-NOTES.md']=public_readme(id,name,notes)
    payload['README.txt']=payload['IMPORT-NOTES.md']
    download=native.package('downloads/'+('creatures' if category=='Creatures and mounts' else 'world')+'/'+id+'.zip',payload)
    files.add(download['file']);download.update(label='VD + registered PNGs + native records' if motion else 'Native art + manifests + import notes',status='Import and target-client checks required')
    item={'id':id,'name':name,'project':project,'category':category,'kind':'motion' if motion else 'still','notes':notes,'directions':8 if motion else 1,'previews':previews,'thumbnail':next((p['file'] for p in previews if p.get('thumbnail')),previews[0]['file']),'download':download}
    for p in previews:p.pop('thumbnail',None)
    if motion:item.update(motion=motion,actions=actions)
    catalog['items'].append(item);added.append(id)
    evidence.append({'id':id,'files':len(payload),'download':download})
    print('Prepared',id,flush=True)

def previews_from_payload(id,payload):
    result=[]
    for key,blob in payload.items():
        if key.endswith(('.png','.gif')) and (key.startswith('previews/') or key.startswith('preview/') or '/' not in key) and not re.search('original|comparison|source|dimensions',key,re.I):
            result.append({'label':Path(key).stem.replace('_',' ')+' (offline preview)','file':media(id,key,blob)})
    assert result,id
    result.sort(key=lambda p:('preview' not in p['file'],p['file']))
    return result

def motion_view(id,sequences,labels,ms=130):
    actions=sorted({a for a,d in sequences});stored={k:v for k,v in sequences.items() if k[1]<5}
    radius=max(max(cx,im.width-cx) for seq in stored.values() for im,cx,cy in seq)+12
    vw=math.ceil(radius/8)*16;ox=vw//2
    oy=math.ceil((max(im.height+cy for seq in stored.values() for im,cx,cy in seq)+12)/8)*8
    vh=math.ceil((oy+max(-cy for seq in stored.values() for im,cx,cy in seq)+12)/8)*8
    tile=math.ceil(max(max(im.size) for seq in stored.values() for im,cx,cy in seq)/8)*8
    total=sum(len(seq) for seq in stored.values());sheet=Image.new('RGBA',(tile*16,tile*math.ceil(total/16)))
    board=Image.new('RGB',(vw*5,(vh+20)*len(actions)),'#161b20');draw=ImageDraw.Draw(board)
    groups=[];previews=[];index=0
    def pose(im,cx,cy):
        assert 0<=ox-cx and ox-cx+im.width<=vw and 0<=oy-im.height-cy and oy-cy<=vh
        c=Image.new('RGB',(vw,vh),'#161b20');c.paste(im,(ox-cx,oy-im.height-cy),im);return c
    for row,a in enumerate(actions):
        for d in range(5):
            group=[]
            for im,cx,cy in stored[a,d]:
                sheet.paste(im,((index%16)*tile,(index//16)*tile));group.append([index,im.width,im.height,cx,cy]);index+=1
            groups.append(group);board.paste(pose(*stored[a,d][0]),(d*vw,row*(vh+20)+20))
        draw.text((8,row*(vh+20)+3),labels[row],fill='#ded8b7')
        seq=[pose(*f) for f in stored[a,1]];stream=io.BytesIO()
        seq[0].save(stream,format='GIF',save_all=True,append_images=seq[1:],duration=ms,loop=0,optimize=False)
        previews.append({'label':labels[row]+' — full sequence (illustrative timing)','file':media(id,f'action-{a:02}.gif',stream.getvalue())})
    previews.append({'label':'Every supplied action — five stored views','file':media(id,'all-actions.png',native.png(board))})
    previews.append({'label':'Native-size animation frame','file':media(id,'thumbnail.png',native.png(pose(*stored[actions[0],1][0]))),'thumbnail':True})
    atlas='sheets/'+id+'.png';(GALLERY/atlas).write_bytes(native.png(sheet));files.add(atlas)
    value={'parts':[{'file':atlas,'tile':tile,'columns':16,'groups':groups}],'bodies':None,'viewport':[vw,vh,ox,oy],'actions':labels,'nativeActionIds':actions,'frameMs':ms}
    motion=media(id,'motion.js',('window.MOTION=window.MOTION||{};window.MOTION['+json.dumps(id)+']='+json.dumps(value,separators=(',',':'))+';\n').encode())
    return motion,previews

def compare_sequences(vd,sequences):
    _,_,decoded=native.decode_vd(vd)
    assert set(decoded)=={k for k in sequences if k[1]<5}
    for k,seq in decoded.items():
        assert len(seq)==len(sequences[k])
        for a,b in zip(seq,sequences[k]):
            assert a[1:]==b[1:] and a[0].size==b[0].size
            aa,bb=np.array(a[0]),np.array(b[0]);assert np.array_equal(aa[:,:,3],bb[:,:,3])
            mask=aa[:,:,3]>0;assert np.array_equal(aa[:,:,:3][mask]>>3,bb[:,:,:3][mask]>>3)
            counts['nativeAnimationFrames']+=1

def main():
    # Completed static collections. Earlier concept, mismatched-scale and superseded
    # archives are retained at source and deliberately excluded from publication.
    for archive,base,id,project,name,notes in [
     ('UO_Cave_Dungeon_Walls.zip','UO_Cave_Dungeon_Walls/','uo-cave-dungeon-walls','Cave-Dungeon-Walls','Cave dungeon walls — 99 pieces','Three materials: limestone, mossy slate and volcanic rock. 33 modular pieces each, including walls, corners, overhangs, low rocks, tunnel arches, broken walls and floors. Native canvases follow the recorded UO references; transparency opens the tunnels. Collision and arch flags require target-server setup.'),
     ('UO_Curved_Wall.zip','UO_Curved_Wall/','uo-curved-stone-walls','Curved-Stone-Walls','Curved stone walls — 45 pieces','Two- and three-tile-radius quarters, straight walls, windows, doorframes and separate open/closed doors. Native curved silhouettes and relative placement recipes are included. Preserve the 44-pixel-wide canvases and padding; door artwork alone does not provide opening behavior.'),
     ('UO_Wall_Pack_V2_Export_Matched.zip','UO_Wall_Pack_V2/','uo-wall-styles-v2','Wall-Styles','Five wall styles — native-scale revision','57 modular pieces across dungeon, timber/plaster house, marble, sandstone and ruined masonry. This corrected revision follows measured original canvases and silhouettes. Native PNG/BMP/static records and placement examples are included. IDs, collision and door behavior remain separate integration work.'),
     ('UO_Wilderness_New_Art.zip','UO_Wilderness_New_Art/','uo-wilderness-new-art','Wilderness-New-Art','Wilderness — 36 original decorations','36 newly drawn palms, natural details and wilderness objects, scaled using original UO scenery measurements. This is a distinct collection from Wilderness Biomes. Static decorations; no harvesting or environmental gameplay is provided.'),
     ('UO_Library_Books.zip','UO_Library_Books/','uo-library-books','Library-Books','Library books — 64 designs and fluttering grimoire','64 distinct closed, open and magical book designs with two static facings each. Includes an ambient Fluttering Grimoire VD with fly/walk and hover/stand only, eight PNG views and a static animation alternative. Other creature actions and server flight behavior are not supplied.'),
     ('UO_Book_Stacks.zip','UO_Book_Stacks/','uo-book-stacks','Book-Stacks','Book stacks — 36 designs','Twelve small, twelve medium and twelve large stacks; two static facings per design, 72 sprites. Native PNG/BMP/static records and measured placement metadata. Decorative scenery; books are not automatically readable or interactive.')]:
        with open_source(archive) as z:
            payload=public_payload(z,base);verify_static(payload)
            add(id,name,project,notes,payload,previews_from_payload(id,payload))

    # Each moving material gets its own bounded download and supplied preview.
    with open_source('UO_Moving_Terrain.zip') as z:
        base='UO_Moving_Terrain/';loops=json.loads(z.read(base+'animations.json'))
        for material in dict.fromkeys(x['material'] for x in loops):
            rows=[x for x in loops if x['material']==material];key=rows[0]['loop'][:-2];id='moving-terrain-'+slug(key)
            all_payload=public_payload(z,base)
            payload={n:b for n,b in all_payload.items() if any(row['loop'] in n for row in rows) or n in ('previews/'+key+'.gif',)}
            payload['animations.json']=(json.dumps(rows,indent=2)+'\n').encode()
            raw=list(csv.DictReader(io.StringIO(z.read(base+'frames.csv').decode().replace('\r',''))))
            selected=[r for r in raw if r.get('loop') in {x['loop'] for x in rows}]
            if selected:
                out=io.StringIO();w=csv.DictWriter(out,fieldnames=selected[0].keys());w.writeheader();w.writerows(selected);payload['frames.csv']=out.getvalue().encode()
            verify_static(payload)
            assert len(rows)==4 and all(r['frame_count']==32 and r['width_px']==r['height_px']==44 for r in rows)
            notes=material+': four adjoining 44 × 44 tiles, 32 frames per tile; 128 exact source frames. Approximately 3.2 seconds per loop at the supplied interval. Animated static/item art: configure AnimData and the animation flag after allocating free frame ranges. Replacing ordinary map land does not install animation. Movement, swimming and damage rules are separate.'
            previews=previews_from_payload(id,payload)
            previews.sort(key=lambda row:not row['file'].endswith('.gif'))
            add(id,material+' — animated terrain','Moving-Terrain',notes,payload,previews)

    # Roads are split by foreground material; every matching background is retained.
    with open_source('UO_Terrain_Roads_and_Corners.zip') as z:
        base='UO_Terrain_Roads_and_Corners/';manifest=json.loads(z.read(base+'manifest.json'));all_payload=public_payload(z,base)
        for foreground in dict.fromkeys(x['foreground'] for x in manifest):
            rows=[x for x in manifest if x['foreground']==foreground];key=rows[0]['pair'].split('__on__')[0];id='terrain-joins-'+slug(key)
            payload={n:b for n,b in all_payload.items() if n.startswith('terrain_sets/'+key+'/') or n in ('shapes.json',)}
            payload['manifest.json']=(json.dumps(rows,indent=2)+'\n').encode()
            verify_static(payload)
            assert len(rows)==134
            for row in rows:assert digest(payload[row['land_png']])==row['sha256_land_png']
            previews=[]
            for n,b in payload.items():
                if n.endswith(('Joined_Example.png','All_67_Pieces.png')):previews.append({'label':Path(n).parts[2].replace('_',' ')+' — '+Path(n).stem.replace('_',' '),'file':media(id,n.replace('/','-'),b)})
            notes=foreground+': 134 shaped road, corner, area and width-adapter tiles across two contrasting backgrounds, with matching 44 × 44 land art, 64 × 64 textures and native land records. All 67 pieces per background are included. Allocate compatible land/texture IDs and configure terrain behavior in your own map editor; the matching full tiles are in the existing Terrain Pack.'
            add(id,foreground+' — roads and area joins','Terrain-Roads-and-Corners',notes,payload,previews)

    # Four current revision-two race deliveries. Historical public versions remain.
    for archive,race in [('UO_Dwarves_5_Roles_V2.zip','dwarf'),('UO_Gnomes_5_Roles_V2.zip','gnome'),('UO_Orcs_5_Roles_V2.zip','orc'),('UO_Ratkin_5_Roles_V2.zip','ratkin')]:
        with open_source(archive) as z:
            base=archive[:-4]+'/';layout=list(csv.DictReader(io.StringIO(z.read(base+'human_action_layout.csv').decode().replace('\r',''))));labels=[r['action'] for r in layout]
            for role in ['merchant','mage','warrior','citizen','leader']:
                id=race+'-role-'+role+'-v2';folder=base+'races/'+race+'/'+role+'/';payload=public_payload(z,folder)
                body=json.loads(payload['body.json']);vd=payload[race+'_'+role+'.vd'];sequences={}
                for action in range(35):
                    for d in range(8):
                        prefix=f'png/Action_{action:02}/Direction_{d}/';metadata=json.loads(payload[prefix+'frames.json']);seq=[]
                        for row in metadata['frames']:
                            im=native.image(payload[prefix+row['file']]);assert im.size==(192,192)
                            crop=im.crop((row['paste_x'],row['paste_y'],row['paste_x']+row['width'],row['paste_y']+row['height']))
                            seq.append((crop,row['center_x'],row['center_y']));counts['pngAnimationFrames']+=1
                        sequences[action,d]=seq
                compare_sequences(vd,sequences)
                motion,previews=motion_view(id,sequences,labels)
                notes='Art revision 2: smoother original '+race+' geometry and painted surface detail with a baked-in '+role+' outfit. All 35 humanoid slots, including seven mounted actions; 1,050 stored VD frames and 1,680 registered PNG frames. Existing human equipment is not automatically fitted. Hair, paperdolls, vendor/AI rules, body mappings and target-client seating remain separate integration work. Client runtime has not been tested.'
                add(id,body['name']+' — revision 2',race.title()+'-NPC-Roles-V2',notes,payload,previews,motion,35,'Creatures and mounts')

    # Greek adaptations retain all available original actions. Medusa remains PNG-only.
    with open_source('UO_Greek_Mythology_Mobs.zip') as z:
        base='UO_Greek_Mythology_Mobs/';manifest=json.loads(z.read(base+'manifest.json'))
        for row in manifest:
            key=row['key'];id='greek-mythology-'+slug(key);folder=base+'creatures/'+key+'/';payload=public_payload(z,folder);sequences={}
            for a in row['actions']:
                for d in range(8):
                    prefix=f'frames/Action_{a:02}/Direction_{d}/';metadata=json.loads(payload[prefix+'frames.json']);seq=[]
                    for f in metadata['frames']:
                        im=native.image(payload[prefix+f['file']]);crop=im.crop((f['paste_x'],f['paste_y'],f['paste_x']+f['width'],f['paste_y']+f['height']))
                        seq.append((crop,f['center_x'],f['center_y']));counts['pngAnimationFrames']+=1
                    sequences[a,d]=seq
            if row.get('vd_file'):
                vd=z.read(base+row['vd_file']);payload[Path(row['vd_file']).name]=vd;compare_sequences(vd,sequences)
            labels=['Walk' if a==0 else 'Action '+str(a) for a in row['actions']];motion,previews=motion_view(id,sequences,labels,120)
            notes='Palette/material adaptation of original UO anatomy and poses. '+str(len(row['actions']))+' available source actions, eight PNG views and '+str(row['frames'])+' registered PNG frames. '+('Exact native VD is included. ' if row.get('vd_file') else 'PNG and original UOP action/registration metadata only; no VD is supplied and action IDs need target-format mapping. ')+'No newly modeled anatomy, monster abilities, body-ID allocation or client integration.'
            add(id,row['name'],'Greek-Mythology',notes,payload,previews,motion,len(labels),'Creatures and mounts')
            if not row.get('vd_file'):catalog['items'][-1]['download']['label']='Registered PNG frames + original action metadata'

    # Six fully exported ambient flying-book designs, plus the separate roaming demo.
    with open_source('UO_Flying_Books_6.zip') as z:
        base='UO_Flying_Books_6/';rows=json.loads(z.read(base+'catalogue.json'))
        for row in rows:
            key=row['key'];id='flying-book-'+slug(key);payload=public_payload(z,base+key+'/');vd=payload[key+'.vd'];_,_,sequences=native.decode_vd(vd)
            counts['nativeAnimationFrames']+=sum(len(s) for s in sequences.values())
            motion,previews=motion_view(id,sequences,['Fly / walk','Hover / stand'],row['fly_ms'])
            verify_static(payload)
            notes=row['detail']+'. An ambient book with fly/walk and hover/stand only. Sixteen flight and eight hover frames per facing, eight independently rendered PNG directions and five stored VD directions; unused action slots remain empty. Registered canvas 64 × 80. Static animation alternative included. No combat actions or autonomous flight behavior.'
            add(id,row['name'],'Flying-Books',notes,payload,previews,motion,2,'Creatures and mounts')
    with open_source('UO_Roaming_Library_Books.zip') as z:
        base='UO_Roaming_Library_Books/';payload=public_payload(z,base)
        payload={k:v for k,v in payload.items() if k!='preview/library_room_source.png'}
        notes='Six existing flying-book designs with unchanged client animations and a configurable Sphere X ambient roaming example. The supplied 16-second room GIF is an offline illustration; its background is not an importable house or map. Configure unused body IDs and validate movement/placement in an isolated shard. The original book static exports are available separately.'
        add('uo-roaming-library-books','Books that roam around a room','Roaming-Library-Books',notes,payload,previews_from_payload('uo-roaming-library-books',payload))

    assert catalog['items'][:len(old)]==old
    catalog_path.write_text('window.GALLERY='+json.dumps(catalog,ensure_ascii=False,separators=(',',':'))+';',encoding='utf-8')
    folder=ROOT/'data/release-assets/2026-10-16';folder.mkdir(parents=True,exist_ok=True)
    release={'version':1,'bundles':[],'files':[]};parts=[[]];size=0
    for key in sorted(files):
        blob=(GALLERY/key).read_bytes()
        if size+len(blob)>18*1024*1024 and parts[-1]:parts.append([]);size=0
        parts[-1].append(('gallery/'+key,blob));size+=len(blob)
    for i,part in enumerate(parts,1):
        name=f'assets-{i:02}.zip';target=folder/name
        with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
            for key,blob in part:
                info=zipfile.ZipInfo(key,(2026,10,16,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,blob)
                release['files'].append({'path':key,'bytes':len(blob),'sha256':digest(blob),'bundle':name})
        blob=target.read_bytes();assert len(blob)<25*1024*1024
        release['bundles'].append({'file':name,'bytes':len(blob),'sha256':digest(blob)})
    (folder/'manifest.json').write_text(json.dumps(release,indent=2)+'\n',encoding='utf-8')
    ignore=ROOT/'.gitignore';ignore.write_text(ignore.read_text(encoding='utf-8')+'\n# October 16 curated public artwork\n'+''.join('/public/gallery/'+key+'\n' for key in sorted(files)),encoding='utf-8')
    report={'date':'2026-10-16','sources':sources,'items':added,'existingItemsPreserved':len(old),'counts':counts,'publicFiles':len(files),'bundles':len(parts),'packages':evidence,'limitations':'Native format/pixel checks and offline previews. No live client or shard installation, ID assignment, appearance acceptance or gameplay verification.'}
    (ROOT/'data/oct16-assets-release.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k in ('counts','publicFiles','bundles','existingItemsPreserved')}),flush=True)

if __name__ == "__main__":
    main()
