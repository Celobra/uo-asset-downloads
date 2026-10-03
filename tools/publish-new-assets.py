"""Publish reviewed runtime assets, preserving native VDs and registered pixels.

Inputs are supplied explicitly; original archives are never edited. Requires
Pillow and NumPy. Only runtime art, public metadata and import notes are packaged.
The architect input must be a separately reviewed public build with sanitized
embedded catalogue data, portable source and a Public_Build_Verification.json.
"""
import argparse
import base64
import hashlib
import io
import json
import math
import re
import struct
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

SITE = Path(__file__).resolve().parents[1]
GALLERY = SITE / 'public/gallery'
MEDIA = GALLERY / 'media/new-assets'
LOW = ['Walk', 'Run', 'Stand', 'Eat', 'Alert', 'Attack 1', 'Attack 2',
       'Hit reaction / Attack 3 slot', 'Death 1', 'Fidget 1', 'Fidget 2', 'Lie down', 'Death 2']
HIGH = ['Walk', 'Stand', 'Death 1', 'Death 2', 'Attack 1', 'Attack 2', 'Attack 3',
        'Misc 1', 'Misc 2', 'Misc 3', 'Stumble', 'Slap ground', 'Cast', 'Get hit 1',
        'Misc 4', 'Get hit 2', 'Get hit 3', 'Fidget 1', 'Fidget 2', 'Fly', 'Land', 'Die in flight']
REUSE_GIFS = False
CAN_REUSE_GIFS = False


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_json(data):
    return json.loads(data.decode('utf-8-sig'))


def png(im):
    fresh = Image.frombytes('RGBA', im.size, im.convert('RGBA').tobytes())
    stream = io.BytesIO()
    fresh.save(stream, format='PNG', optimize=True)
    return stream.getvalue()


def image(data):
    return Image.open(io.BytesIO(data)).convert('RGBA')


def assert_public(name, data):
    if name.endswith(('.txt', '.md', '.json', '.csv', '.js', '.html', '.py', '.ps1')):
        value = data.decode('utf-8-sig')
        if re.search(r'Users[\\/]|My Drive|accounts\.scp|sphereworld|PRIVATE KEY|gh[pousr]_[A-Za-z0-9]{20}|sk-[A-Za-z0-9]{30}', value, re.I):
            raise ValueError('Private material in ' + name)


def package(relative, payload):
    for name, data in payload.items():
        assert_public(name, data)
    payload = dict(payload)
    payload.pop('SHA256SUMS.txt', None)
    payload['SHA256SUMS.txt'] = ''.join(sha(data) + '  ' + name + '\n'
                                      for name, data in sorted(payload.items())).encode()
    target = GALLERY / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name, data in sorted(payload.items()):
            info = zipfile.ZipInfo(name, date_time=(2026, 10, 3, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, data)
    with zipfile.ZipFile(target) as z:
        assert z.testzip() is None
        assert all(z.read(name) == data for name, data in payload.items())
    assert target.stat().st_size < 25 * 1024 * 1024
    return {'file': relative, 'sizeBytes': target.stat().st_size, 'sha256': sha(target.read_bytes())}


def decode_vd(blob):
    """Independent bounded reader for UOFiddler type-6 MUL animation exports."""
    version, category = struct.unpack_from('<hh', blob)
    assert version == 6 and category in (0, 1)
    capacity = 22 if category == 0 else 13
    cursor = 4 + capacity * 5 * 12
    decoded = {}
    for slot in range(capacity * 5):
        lookup, length, extra = struct.unpack_from('<iii', blob, 4 + 12 * slot)
        if lookup == -1:
            assert (lookup, length, extra) == (-1, -1, -1)
            continue
        assert lookup == cursor and extra == 0 and length >= 528 and lookup + length <= len(blob)
        palette = np.array(struct.unpack_from('<256H', blob, lookup), dtype=np.uint16)
        rgb = np.stack(((palette >> 10) & 31, (palette >> 5) & 31, palette & 31), axis=1).astype(np.uint8) * 8
        count = struct.unpack_from('<I', blob, lookup + 512)[0]
        assert 0 < count <= 100
        offsets = struct.unpack_from('<' + 'I' * count, blob, lookup + 516)
        expected = 4 + 4 * count
        sequence = []
        for f, offset in enumerate(offsets):
            assert offset == expected
            start = lookup + 512 + offset
            limit = lookup + 512 + offsets[f + 1] if f + 1 < count else lookup + length
            assert start + 12 <= limit
            cx, cy, w, h = struct.unpack_from('<hhHH', blob, start)
            assert 0 < w <= 1024 and 0 < h <= 1024
            values = np.zeros((h, w), dtype=np.uint8)
            occupied = np.zeros((h, w), dtype=bool)
            pos = start + 8
            while True:
                assert pos + 4 <= limit
                header = struct.unpack_from('<I', blob, pos)[0]
                pos += 4
                if header == 0x7fff7fff:
                    break
                unbiased = header ^ 0x80200000
                x = (unbiased >> 22) - 512 + cx
                y = ((unbiased >> 12) & 0x3ff) - 512 + cy + h
                n = unbiased & 0xfff
                assert n > 0 and 0 <= y < h and 0 <= x < x + n <= w and pos + n <= limit
                assert not occupied[y, x:x+n].any()
                row = np.frombuffer(blob[pos:pos+n], dtype=np.uint8)
                values[y, x:x+n] = row
                occupied[y, x:x+n] = True
                pos += n
            assert pos == limit
            expected += pos - start
            # Original MUL palettes can use index zero in visible runs. Alpha
            # comes from run coverage, rather than assuming zero is transparent.
            rgba = np.concatenate((rgb[values], np.where(occupied[..., None], 255, 0).astype(np.uint8)), axis=2)
            sequence.append((Image.fromarray(rgba), cx, cy))
        assert 512 + expected == length
        decoded[slot // 5, slot % 5] = sequence
        cursor += length
    assert cursor == len(blob)
    return category, capacity, decoded


def media_file(id, suffix, data):
    name = id + '-' + suffix
    (MEDIA / name).write_bytes(data)
    return 'media/new-assets/' + name


def save_gif(id, suffix, frames, hold=False, duration=80):
    if CAN_REUSE_GIFS and (MEDIA / (id+'-'+suffix)).is_file():
        with Image.open(MEDIA / (id+'-'+suffix)) as existing:
            assert existing.size == frames[0].size and existing.n_frames == len(frames)
        return 'media/new-assets/'+id+'-'+suffix
    buf = io.BytesIO()
    times = [duration] * len(frames)
    if hold:
        times[-1] = 800
    frames[0].save(buf, format='GIF', save_all=True, append_images=frames[1:],
                   duration=times, loop=0, disposal=2)
    return media_file(id, suffix, buf.getvalue())


def publish_creature(id, name, project, blob, archive, frame_root, viewer=None, expected_hashes=None, notes=''):
    global CAN_REUSE_GIFS
    CAN_REUSE_GIFS = False
    category, capacity, decoded = decode_vd(blob)
    action_ids = sorted({a for a, d in decoded})
    labels = [(next(x.get('display_name', (LOW if category else HIGH)[a]) for x in viewer['actions'] if x['id'] == a)
               if viewer else (LOW if category else HIGH)[a]) for a in action_ids]
    frames = []
    payload = {name.replace(' ', '_') + '.vd': blob}
    sequences = {}
    for a in action_ids:
        for d in range(5):
            seq = decoded[a, d]
            folder = frame_root + f'/Action_{a:02}/Direction_{d}'
            metadata = read_json(archive.read(folder + '/frames.json'))
            assert len(metadata['frames']) == len(seq)
            for f, ((native, cx, cy), info) in enumerate(zip(seq, metadata['frames'])):
                raw = archive.read(folder + '/' + info['file'])
                if expected_hashes is not None:
                    key = f'Native_Frames/Action_{a:02}/Direction_{d}/' + info['file']
                    assert sha(raw) == expected_hashes[key]
                original = image(raw)
                crop = original.crop(info['trim_box']) if 'trim_box' in info else original
                assert crop.size == native.size == (info['width'], info['height'])
                assert (cx, cy) == (info['center_x'], info['center_y'])
                got, wanted = np.asarray(native), np.asarray(crop)
                visible = wanted[:, :, 3] > 0
                assert np.array_equal(got[:, :, 3], wanted[:, :, 3])
                assert np.array_equal(got[:, :, :3][visible] >> 3, wanted[:, :, :3][visible] >> 3)
                path = f'Frames/Action_{a:02}/Direction_{d}/frame_{f:04}.png'
                # Preserve the selected source's display pixels; VD comparison covers all RGB555 bits.
                payload[path] = png(crop)
                frames.append({'action': a, 'direction': d, 'frame': f, 'file': path,
                               'width': crop.width, 'height': crop.height, 'center_x': cx, 'center_y': cy})
                seq[f] = (crop, cx, cy)
            sequences[a, d] = seq
    if viewer:
        vw, vh = viewer['canvas']
        ox, oy = viewer['anchor']
    else:
        extent = max(max(cx, im.width-cx) for seq in sequences.values() for im, cx, cy in seq) + 16
        ox = math.ceil(extent / 8) * 8
        vw = ox * 2
        oy = math.ceil((max(im.height+cy for seq in sequences.values() for im, cx, cy in seq)+16) / 8) * 8
        vh = math.ceil((oy + max(-cy for seq in sequences.values() for im, cx, cy in seq)+16) / 8) * 8
    tile = max(max(im.size) for seq in sequences.values() for im, cx, cy in seq)
    tile = math.ceil(tile / 8) * 8
    previous = GALLERY / f'downloads/creatures/{id}.zip'
    if REUSE_GIFS and previous.is_file():
        with zipfile.ZipFile(previous) as old:
            assert old.read(name.replace(' ','_')+'.vd') == blob
            assert read_json(old.read('frames.json'))['frames'] == frames
            assert all(old.read(n) == data for n,data in payload.items() if n.endswith('.png'))
        previous_motion = (MEDIA/(id+'-motion.js')).read_text()
        prior = json.loads(previous_motion.split(']=',1)[1].rstrip(';\n'))
        assert prior['viewport'] == [vw,vh,ox,oy]
        CAN_REUSE_GIFS = True
    sheet = Image.new('RGBA', (tile*16, tile*math.ceil(len(frames)/16)))
    groups, boards, previews = [], {}, []
    index = 0
    all_actions = Image.new('RGB', (vw*5, (vh+20)*len(action_ids)), '#161b20')
    draw = ImageDraw.Draw(all_actions)
    for row, a in enumerate(action_ids):
        count = len(sequences[a, 0])
        assert all(len(sequences[a, d]) == count for d in range(5))
        for d in range(5):
            group = []
            for im, cx, cy in sequences[a, d]:
                assert 0 <= ox-cx and ox-cx+im.width <= vw and 0 <= oy-im.height-cy and oy-cy <= vh
                sheet.paste(im, ((index%16)*tile, (index//16)*tile))
                group.append([index, im.width, im.height, cx, cy])
                index += 1
            groups.append(group)
        boards[a] = []
        for f in range(count):
            board = Image.new('RGB', (vw*5, vh), '#161b20')
            for d in range(5):
                im, cx, cy = sequences[a, d][f]
                board.paste(im, (d*vw+ox-cx, oy-im.height-cy), im)
            boards[a].append(board)
        previews.append({'label': labels[row] + ' — five stored views',
                         'file': save_gif(id, f'action-{a:02}.gif', boards[a], a in ((8,11,12) if category else (2,3,21)))})
        all_actions.paste(boards[a][0], (0, row*(vh+20)+20))
        draw.text((8, row*(vh+20)+3), labels[row], fill='#ded8b7')
    assert index == len(frames)
    previews.append({'label': 'Every available action — native frame board',
                     'file': media_file(id, 'all-actions.png', png(all_actions))})
    stand = 2 if category else 1
    thumb = boards[stand][0].crop((vw, 0, vw*2, vh))
    thumbnail = media_file(id, 'thumbnail.png', png(thumb))
    (GALLERY/'sheets'/f'{id}.png').write_bytes(png(sheet))
    motion = {'parts': [{'file': f'sheets/{id}.png', 'tile': tile, 'columns': 16, 'groups': groups}],
              'bodies': None, 'viewport': [vw,vh,ox,oy], 'actions': labels,
              'nativeActionIds': action_ids, 'frameMs': 80}
    motion_file = media_file(id, 'motion.js', ('window.MOTION=window.MOTION||{};window.MOTION[' +
                   json.dumps(id) + ']=' + json.dumps(motion, separators=(',', ':')) + ';\n').encode())
    mount = bool(viewer and viewer.get('mount'))
    if mount:
        for sex in ['Male', 'Female']:
            for a in [0,1,2]:
                composed = []
                for f in range(len(sequences[a,0])):
                    board = Image.new('RGB', (vw*5,vh), '#161b20')
                    for d in range(5):
                        im,cx,cy = sequences[a,d][f]
                        pose = Image.new('RGBA',(vw,vh))
                        pose.alpha_composite(im,(ox-cx,oy-im.height-cy))
                        rider = viewer['riders'][f'{sex}_{a}_{d}']
                        atlas = image(base64.b64decode(rider['src'].split(',',1)[1]))
                        assert rider['count'] == len(sequences[a,d]) and atlas.size == (vw*rider['count'],vh)
                        pose.alpha_composite(atlas.crop((vw*f,0,vw*(f+1),vh)))
                        board.paste(pose,(d*vw,0),pose)
                    composed.append(board)
                if a in (0,1):
                    previews.append({'label': f'{sex} rider — mounted ' + ('walk' if a == 0 else 'run') + ' (offline)',
                                     'file': save_gif(id,f'rider-{sex.lower()}-{a}.gif',composed)})
                else:
                    # Native opposite facings mirror the whole registered composition.
                    front = composed[0]
                    eight = Image.new('RGB',(vw*8,vh),'#161b20')
                    eight.paste(front,(0,0))
                    for d in [5,6,7]:
                        eight.paste(front.crop((vw*(8-d),0,vw*(9-d),vh)).transpose(Image.Transpose.FLIP_LEFT_RIGHT),(vw*d,0))
                    previews.append({'label': f'{sex} rider fit — eight displayed views (offline)',
                                     'file': media_file(id,f'rider-{sex.lower()}.png',png(eight))})
    if id == 'dnd-native-gorgon':
        manifest_name = next(n for n in archive.namelist() if n.lower().endswith('/effects/fire_snort/effect_manifest.json'))
        effects = read_json(archive.read(manifest_name))
        clean = {'name': 'Gorgon fire snort', 'frameMs': effects['frame_ms'], 'anchor': effects['anchor'],
                 'status': 'Separate effect candidate; triggered and mounted integration required',
                 'frames': [{k:r[k] for k in ['direction','frame','file','canvas','anchor','bounds']} for r in effects['frames']]}
        payload['Effects/Fire_Snort/frames.json'] = json.dumps(clean,indent=2).encode()
        for n in archive.namelist():
            if '/Effects/Fire_Snort/' in n and n.endswith('.png'):
                payload['Effects/Fire_Snort/'+n.split('/Effects/Fire_Snort/',1)[1]] = png(image(archive.read(n)))
        notes += ' Gorgon includes separate registered fire-snort PNGs; server triggers and mounted effect routing are not supplied.'
    public_notes = (f'{name}: {len(frames)} native frames, {len(groups)} populated groups in a {capacity}-action '
                    f'{"animal" if category else "monster"} export. Five stored directions supply eight views through mirroring. '
                    'All available actions have previews. ' + notes)
    if mount:
        public_notes += ' Male/female rider previews are offline base-rider composites; target equipped layers and in-game mount routing need testing.'
    payload['frames.json'] = json.dumps({'actions': labels, 'nativeActionIds': action_ids,
        'capacity':capacity,'storedDirections':5,'displayedDirections':8,'frames':frames},indent=2).encode()
    payload['README.txt'] = (public_notes + '\n\nIMPORT\nBack up client data and test in a development copy. '
        'Import the unchanged VD with UOFiddler into an unused compatible body slot. Preserve category, palettes and signed centres. '
        'This package assigns no destination IDs and contains no client patch or server creature definition. '
        'Configure body routing, gameplay and any mount mapping for the target shard. Verify playback, targeting, hues, '
        'corpse placement, terrain overlap and equipped rider layers in game. Animal slot 7 may be named/routed differently '
        'by client tools. PNG files are native crops; frames.json preserves registration. Preview timing is 80 ms and does not '
        'change game timing. Empty native action slots are omitted from the preview menu.\n\n'
        'Publication checks independently decoded every VD frame and compared RGB555 colours, transparency, dimensions '
        'and centres with the supplied PNGs. Source VDs are unchanged. Final appearance approval and in-game integration '
        'are not implied by these technical checks.\n').encode()
    download = package(f'downloads/creatures/{id}.zip',payload)
    download.update(label='VD + native frames + import notes', status='Mount integration required' if mount else 'Client/server integration required')
    item = {'id':id,'name':name,'project':project,'category':'Creatures and mounts','kind':'motion',
            'notes':public_notes,'actions':len(action_ids),'directions':8,'previews':previews,
            'thumbnail':thumbnail,'motion':motion_file,'download':download}
    audit = {'id':id,'vdSha256':sha(blob),'frames':len(frames),'groups':len(groups),'nativeActionIds':action_ids,
             'capacity':capacity,'mount':mount,'exactRgb555':True,'exactAlpha':True,'exactCentres':True}
    print(json.dumps(audit),flush=True)
    return item,audit


def main():
    global REUSE_GIFS
    parser = argparse.ArgumentParser(description=__doc__)
    for arg in ['batch','pegasus','original-demons','alternate-demons','landscapes','architect','walking-study']:
        parser.add_argument('--'+arg,required=True,type=Path)
    parser.add_argument('--reuse-gifs',action='store_true',help='Resume an interrupted run; existing native files must match exactly')
    args = parser.parse_args()
    REUSE_GIFS = args.reuse_gifs
    MEDIA.mkdir(parents=True,exist_ok=True)
    (GALLERY/'sheets').mkdir(exist_ok=True)
    catalog_path = GALLERY/'catalog.js'
    catalog = read_json(catalog_path.read_bytes().removeprefix(b'window.GALLERY=').removesuffix(b';'))
    existing_ids = {x['id'] for x in catalog['items']}
    additions,audits = [],[]
    with zipfile.ZipFile(args.batch/'UO_Creatures_Animation_Review.zip') as z:
        roster = read_json((args.batch/'batch_manifest.json').read_bytes())['creatures']
        for creature in roster:
            source_id = creature['id']
            folder = args.batch/'VD_Export'/source_id
            blob = (folder/(source_id+'.vd')).read_bytes()
            report = read_json((folder/'VD_Validation.json').read_bytes())
            assert report['roundtrip_pass'] and report['sha256'] == sha(blob) and report['exact_pixels'] and report['exact_centres']
            manifest = read_json((folder/'Export_Manifest.json').read_bytes())
            hashes = {r['file']:r['sha256'] for r in manifest['source_frames']}
            root = 'UO_Creature_Batch/Creatures/'+source_id
            viewer = read_json(z.read(root+'/viewer_data.json'))
            id = 'dnd-native-' + re.sub(r'[^a-z0-9]+','-',creature['name'].lower()).strip('-')
            item,audit = publish_creature(id,creature['name'],'DnD-Native-Creatures',blob,z,root+'/Native_Frames',viewer,hashes)
            additions.append(item); audits.append(audit)
    with zipfile.ZipFile(args.pegasus/'Pegasus_Complete.zip') as z:
        blob = (args.pegasus/'VD_Export/Pegasus.vd').read_bytes()
        report = read_json((args.pegasus/'VD_Export/VD_Validation.json').read_bytes())
        assert report['roundtrip_pass'] and report['sha256'] == sha(blob)
        manifest = read_json((args.pegasus/'VD_Export/Export_Manifest.json').read_bytes())
        hashes = {r['file']:r['sha256'] for r in manifest['source_frames']}
        viewer = read_json((args.pegasus/'viewer_data.json').read_bytes())
        item,audit = publish_creature('pegasus-mount','Pegasus','Pegasus-Mount',blob,z,'Native_Frames',viewer,hashes,
            'Grounded mount animation with wingbeats; flying gameplay is not supplied.')
        additions.append(item); audits.append(audit)
    for path,project in [(args.original_demons,'Original-Demons'),(args.alternate_demons,'Alternate-Demons')]:
        with zipfile.ZipFile(path) as z:
            for filename in sorted(n for n in z.namelist() if n.endswith('.vd')):
                prefix = filename.rsplit('/',1)[0]
                name = Path(filename).stem.replace('-',' ')
                id = re.sub(r'[^a-z0-9]+','-',name.lower())
                note = 'Palette variant of the original UO daemon; original anatomy and animation are retained.' if project == 'Alternate-Demons' else 'Original demon animation; empty unsupported actions remain absent.'
                item,audit = publish_creature(id,name,project,z.read(filename),z,prefix+'/Frames',notes=note)
                additions.append(item); audits.append(audit)
    with zipfile.ZipFile(args.landscapes) as z:
        rows = read_json(z.read('Landscape-Assemblies/catalog.json'))
        for row in rows:
            id = 'landscape-'+row['slug']; prefix = 'Landscape-Assemblies/'+row['slug']+'/'
            layout = read_json(z.read(prefix+'layout.json'))
            comps = layout['components']
            payload = {name:z.read(prefix+name) for name in ['layout.json','components.csv','multi-12.bin','multi-16.bin']}
            for size,fmt in [(12,'<HhhhI'),(16,'<HhhhII')]:
                data = payload[f'multi-{size}.bin']
                assert len(data) == size*len(comps)
                for index,c in enumerate(comps):
                    decoded = struct.unpack_from(fmt,data,index*size)
                    assert decoded[:4] == (c['id'],c['x'],c['y'],c['z'])
            notes = ('Existing UO tile composition: '+row['group'].lower()+'. Relative layout coordinates and individual '
                '12/16-byte multi records are supplied. These are placement definitions; original game art is required. '
                'Choose a compatible format and unused multi slot, or place the listed statics in a world editor. '
                'Flat-ground layout; check slopes, collision, canopy overlap and player access in game. No harvest or seasonal scripts.')
            payload['README.txt'] = (row['name']+'\n\n'+notes+'\nBIN files are individual records, not complete multi.mul files. '
                                     'Back up client data before importing. No IDs are reserved and no client or server files are installed.\n').encode()
            preview = media_file(id,'preview.png',png(image(z.read(prefix+'Preview.png'))))
            download = package(f'downloads/world/{id}.zip',payload)
            download.update(label='Layout JSON + CSV + native multi records',status='Placement and game checks required')
            additions.append({'id':id,'name':row['name'],'project':'Landscape-Assemblies','category':'World and items',
                'kind':'still','notes':notes,'directions':1,'previews':[{'label':'Native tile assembly', 'file':preview}],
                'thumbnail':preview,'download':download})
    # Finished two-view study remains explicitly labelled as a study, with no VD claim.
    with zipfile.ZipFile(args.walking_study) as z:
        payload = {n:z.read(n) for n in z.namelist() if not n.endswith('/')}
        preview_name = next(n for n in payload if n.endswith('Walking.gif'))
        board_name = next(n for n in payload if n.endswith('Walking-Frames.png'))
        preview = media_file('ashhorn-tiefling-study','walk.gif',payload[preview_name])
        board = media_file('ashhorn-tiefling-study','frames.png',png(image(payload[board_name])))
        download = package('downloads/creatures/ashhorn-tiefling-study.zip',payload)
        download.update(label='Two-view walking study + PNG frames',status='Study only — no VD or full action set')
        additions.append({'id':'ashhorn-tiefling-study','name':'Ashhorn Tiefling — Walking Study','project':'Ashhorn-Tiefling',
            'category':'Creatures and mounts','kind':'still','notes':'Completed two-view walking experiment: ten frames per view, '
            '100 ms preview timing. Includes registered PNGs. Other directions, idle/combat/death actions, VD, paperdoll and server integration are not supplied. '
            'Final visual approval and in-game playback are unverified.','directions':2,'thumbnail':board,
            'previews':[{'label':'Both walking views','file':preview},{'label':'All twenty frames','file':board}], 'download':download})
    # The executable and example contain no client artwork; use public, portable notes.
    with zipfile.ZipFile(args.architect/'BritanniaArchitect-Windows.zip') as z:
        payload = {n:z.read(n) for n in z.namelist()}
    public_build = read_json((args.architect/'Public_Build_Verification.json').read_bytes())
    assert public_build['privateCatalogueRemoved'] and public_build['sourceIncluded']
    assert public_build['executableSha256'] == sha(payload['BritanniaArchitect.exe'])
    assert any(n.startswith('Source/') for n in payload)
    for n in ['START-HERE.txt','VERIFICATION.txt']:
        text = payload[n].decode('utf-8-sig').replace('C:\\sphere\\UOFiles','your existing UO client folder')
        text = text.replace('Your folder is already filled in:', 'Select the folder containing your compatible client files:')
        text = text.replace('your Sphere server','a Sphere test server').replace('your folder:', 'a compatible client folder:')
        payload[n] = text.encode()
    app_download = package('downloads/tools/britannia-architect-windows.zip',payload)
    app_download.update(label='Windows application + example town + source',status='Requires compatible UO files and target-shard checks')
    app_preview = media_file('britannia-architect','preview.jpg',(args.architect/'Application-Preview.jpg').read_bytes())
    additions.append({'id':'britannia-architect','name':'Britannia Architect — Town Builder','project':'Britannia-Architect',
        'category':'World and items','kind':'still','notes':'Windows town-building application. Select a real UO map area, '
        'generate merchant premises, roads, houses and buildable plots, edit prices and save projects. Reads your existing compatible '
        'UO files and exports Sphere X packages; no game art is bundled. Source delivery reports 62 passing checks and isolated-server '
        'import, restart and core purchases. Target-shard compatibility, customization and some rejection/recovery cases need testing. '
        'Extract the ZIP and run BritanniaArchitect.exe; no separate Python installation is required.',
        'directions':1,'thumbnail':app_preview,'previews':[{'label':'Application with example town','file':app_preview}], 'download':app_download})
    assert not existing_ids.intersection(x['id'] for x in additions), 'Already published IDs'
    assert len({x['id'] for x in additions}) == len(additions)
    catalog['items'].extend(additions)
    catalog_path.write_text('window.GALLERY='+json.dumps(catalog,ensure_ascii=False,separators=(',',':'))+';',encoding='utf-8')
    release = {'date':'2026-10-03','addedItems':len(additions),'nativeCreatures':audits,
        'landscapeLayouts':50,'landscapeBinaryRoundTrips':100,'walkingStudyFrames':20,
        'items':[x['id'] for x in additions],'existingItemsPreserved':True,
        'packagePrivacy':'Runtime whitelist; private prompts, references and logs excluded',
        'reviewLimitations':'Technical and offline visual review; no final user appearance approval or in-game integration claim.'}
    (SITE/'data/new-assets-release.json').write_text(json.dumps(release,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'addedItems':len(additions),'nativeFrames':sum(x['frames'] for x in audits),'catalogItems':len(catalog['items'])}),flush=True)


if __name__ == '__main__':
    main()
