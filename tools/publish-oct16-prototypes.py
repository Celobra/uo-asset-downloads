"""Publish the explicitly labelled original-body animation prototypes.

Uses the exact selected export, omitting source atlases and creation references.
Run after the completed October 16 artwork publication preparation.
"""
import importlib.util, json, zipfile
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('publication',ROOT/'tools/publish-oct16-assets.py')
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
with p.open_source('UO_New_Monsters_15_Prototypes.zip') as source:
    base='UO_New_Monsters_15/'
    validation=json.loads(source.read(base+'validation.json'))
    assert validation['art_status']=='prototype' and validation['monsters']==15
    for row in validation['creatures']:
        key=row['name'].lower().replace(' ','_')
        if key=='chest_mimic':key='mimic'
        id='original-prototype-'+p.slug(key)
        payload=p.public_payload(source,base+'monsters/'+key+'/')
        # The original sheets and crop/source-cell audit are private creation
        # material. Runtime frame metadata retains the actual ground root.
        metadata=json.loads(payload.pop('manifest.json'))
        payload['body.json']=(json.dumps({k:v for k,v in metadata.items() if k not in ('source_cells','source_sha256','source_rows')},indent=2)+'\n').encode()
        vd=source.read(base+'prototype_vd/'+key+'.vd');payload[key+'.vd']=vd
        category,capacity,decoded=p.native.decode_vd(vd)
        assert category==0 and capacity==22 and sorted({a for a,d in decoded})==[0,1,2,4,10]
        sequences={}
        for a in [0,1,2,4,10]:
            for d in range(8):
                prefix=f'frames/Action_{a:02}/Direction_{d}/'
                frames=json.loads(payload[prefix+'frames.json'])['frames'];seq=[]
                for f in frames:
                    image=p.native.image(payload[prefix+f['file']]);box=image.getbbox();assert box
                    crop=image.crop(box);cx=f['root'][0]-box[0];cy=f['root'][1]-box[3]
                    seq.append((crop,cx,cy));p.counts['pngAnimationFrames']+=1
                sequences[a,d]=seq
        p.compare_sequences(vd,sequences)
        labels=['Walk — 4 poses','Idle — single pose','Death — '+str(len(sequences[2,0]))+' poses','Attack — 3 poses','Hit — single pose']
        motion,previews=p.motion_view(id,sequences,labels,150)
        notes='ANIMATION PROTOTYPE: '+row['name']+' with newly drawn anatomy and poses, distinct from the earlier palette adaptations. Five populated slots out of 22: walk (four poses), idle (one), death (two or three), attack (three) and hit (one). Five drawn views plus three mirrored views. Short blocking cycles need artist cleanup; silhouettes, anatomy, facing and foot registration may shift. No running, casting, alternate attacks/death or flying actions. Not tested in a running client; not a finished monster release. '
        if key in ('mimic','bulette'):notes+='Some back-facing attack poses have incorrect front-facing detail and need redrawing. '
        if key=='gelatinous_cube':notes+='Translucency is painted into the sprite; the native VD does not provide see-through world rendering. '
        p.add(id,row['name']+' — animation prototype','Original-Monster-Prototypes',notes,payload,previews,motion,5,'Creatures and mounts')
        p.catalog['items'][-1]['download']['status']='Prototype — artist cleanup and client testing required'

assert len(p.added)==15 and p.counts['nativeAnimationFrames']==875 and p.counts['pngAnimationFrames']==1400
assert p.catalog['items'][:len(p.old)]==p.old
p.catalog_path.write_text('window.GALLERY='+json.dumps(p.catalog,ensure_ascii=False,separators=(',',':'))+';',encoding='utf-8')
folder=ROOT/'data/release-assets/2026-10-16';target=folder/'manifest.json'
release=json.loads(target.read_text(encoding='utf-8'));old_paths={r['path'] for r in release['files']}
assert not old_paths.intersection('gallery/'+n for n in p.files)
parts=[[]];size=0
for key in sorted(p.files):
    blob=(p.GALLERY/key).read_bytes()
    if size+len(blob)>18*1024*1024 and parts[-1]:parts.append([]);size=0
    parts[-1].append(('gallery/'+key,blob));size+=len(blob)
start=len(release['bundles'])+1
for index,part in enumerate(parts,start):
    name=f'assets-{index:02}.zip';file=folder/name;assert not file.exists()
    with zipfile.ZipFile(file,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as output:
        for key,blob in part:
            info=zipfile.ZipInfo(key,(2026,10,16,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;output.writestr(info,blob)
            release['files'].append({'path':key,'bytes':len(blob),'sha256':p.digest(blob),'bundle':name})
    blob=file.read_bytes();assert len(blob)<25*1024*1024
    release['bundles'].append({'file':name,'bytes':len(blob),'sha256':p.digest(blob)})
target.write_text(json.dumps(release,indent=2)+'\n',encoding='utf-8')
ignore=ROOT/'.gitignore';ignore.write_text(ignore.read_text(encoding='utf-8')+'\n# Original monster animation prototypes\n'+''.join('/public/gallery/'+n+'\n' for n in sorted(p.files)),encoding='utf-8')
report={'date':'2026-10-16','sources':p.sources,'items':p.added,'counts':p.counts,'publicFiles':len(p.files),'bundles':len(parts),'packages':p.evidence,'status':'Animation prototypes; artist cleanup and client testing required'}
(ROOT/'data/oct16-prototypes-release.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'items':len(p.added),'counts':p.counts,'publicFiles':len(p.files),'bundles':len(parts)}),flush=True)
