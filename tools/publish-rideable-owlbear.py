"""Publish the approved Owlbear VD and source-exact native website previews.

Run with --source pointing to the approved Animation_v3 directory and --vd
pointing to the VD selected for publication. Requires Pillow. Does not write
to client data, server scripts, or the source artwork directory.
"""
import argparse
import hashlib
import io
import json
import math
import re
import zipfile
from pathlib import Path

from PIL import Image

ID = 'rideable-owlbear'
VD_SHA = '5e53aa20bb84b223096fda22b796fc7e7f7c21a841ef78f0b300bd72cd677e00'
ACTIONS = ['Walk', 'Run', 'Stand', 'Eat', 'Alert', 'Rear / swipe', 'Lunge',
           'Hit reaction / Attack3', 'Side-collapse death', 'Look fidget',
           'Feather / weight fidget', 'Lie down', 'Forward-collapse death']
SLUGS = ['walk', 'run', 'stand', 'eat', 'alert', 'rear-swipe', 'lunge',
         'hit-reaction', 'death-side', 'look-fidget', 'feather-fidget',
         'lie-down', 'death-forward']
COUNTS = [5, 5, 1, 5, 3, 5, 5, 5, 6, 5, 3, 6, 6]


def sha(blob):
    return hashlib.sha256(blob).hexdigest()


def png(image):
    out = io.BytesIO()
    # Creating fresh image bytes omits source text/path metadata.
    fresh = Image.frombytes('RGBA', image.size, image.convert('RGBA').tobytes())
    fresh.save(out, format='PNG', optimize=True)
    return out.getvalue()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, type=Path)
    parser.add_argument('--vd', required=True, type=Path)
    args = parser.parse_args()
    source = args.source.resolve()
    vd = args.vd.read_bytes()
    if sha(vd) != VD_SHA:
        raise ValueError('Selected VD differs from the approved Owlbear export')
    report = json.loads((source / 'VD_Export/VD_Validation.json').read_text())
    if report['status'] != 'passed' or report['vd_sha256'] != VD_SHA:
        raise ValueError('Missing matching native decoder verification')
    exported = json.loads((source / 'VD_Export/Export_Manifest.json').read_text())
    hashes = {entry['file']: entry['sha256'] for entry in exported['source_frames']}
    site = Path(__file__).resolve().parents[1]
    gallery = site / 'public/gallery'
    catalog_path = gallery / 'catalog.js'
    script = catalog_path.read_text(encoding='utf-8')
    catalog = json.loads(script.removeprefix('window.GALLERY=').removesuffix(';'))
    if any(item['id'] == ID for item in catalog['items']):
        raise ValueError('Rideable Owlbear already exists; review it before replacing')
    media = gallery / 'media' / ID
    media.mkdir(parents=True, exist_ok=True)
    (gallery / 'sheets').mkdir(exist_ok=True)
    sheet = Image.new('RGBA', (160 * 16, 160 * math.ceil(300 / 16)))
    groups, sequences, payload = [], {}, {'Owlbear.vd': vd}
    native = []
    frame_index = 0
    for action, expected in enumerate(COUNTS):
        for direction in range(5):
            folder = source / f'Native_Frames/Action_{action:02}/Direction_{direction}'
            metadata = json.loads((folder / 'frames.json').read_text())
            if len(metadata['frames']) != expected:
                raise ValueError('Incorrect native frame count')
            seq, group = [], []
            for info in metadata['frames']:
                path = folder / info['file']
                if sha(path.read_bytes()) != hashes[path.relative_to(source).as_posix()]:
                    raise ValueError('Native sprite differs from verified VD source')
                image = Image.open(path).convert('RGBA')
                box = tuple(info['trim_box'])
                crop = image.crop(box)
                if image.getbbox() != box or crop.size != (info['width'], info['height']):
                    raise ValueError('Invalid frame dimensions or trim')
                if box[:2] != (80 - info['center_x'], 113 - info['center_y'] - info['height']):
                    raise ValueError('Native frame centre mismatch')
                sheet.paste(crop, ((frame_index % 16) * 160, (frame_index // 16) * 160))
                group.append([frame_index, info['width'], info['height'],
                              info['center_x'], info['center_y']])
                name = f'Frames/Action_{action:02}/Direction_{direction}/{info["file"]}'
                payload[name] = png(crop)
                native.append({'action': action, 'direction': direction,
                               'frame': len(seq), 'file': name,
                               'width': info['width'], 'height': info['height'],
                               'center_x': info['center_x'], 'center_y': info['center_y']})
                seq.append(image)
                frame_index += 1
            groups.append(group)
            sequences[action, direction] = seq
    if frame_index != 300 or len(groups) != 65:
        raise ValueError('Incomplete native animation')
    (gallery / 'sheets' / f'{ID}.png').write_bytes(png(sheet))
    motion = {'parts': [{'file': f'sheets/{ID}.png', 'tile': 160,
                         'columns': 16, 'groups': groups}], 'bodies': None,
              'viewport': [160, 160, 80, 113], 'actions': ACTIONS,
              'nativeActionIds': list(range(13)), 'frameMs': 80}
    (media / 'motion.js').write_text(
        'window.MOTION=window.MOTION||{};window.MOTION[' + json.dumps(ID) + ']=' +
        json.dumps(motion, separators=(',', ':')) + ';\n', encoding='utf-8')
    (media / 'thumbnail.png').write_bytes(png(sequences[2, 1][0].resize((320, 320), Image.Resampling.NEAREST)))
    previews = []
    for action, label in enumerate(ACTIONS):
        frames = []
        for index in range(COUNTS[action]):
            board = Image.new('RGB', (800, 160), '#161b20')
            for direction in range(5):
                image = sequences[action, direction][index]
                board.paste(image, (direction * 160, 0), image)
            frames.append(board.resize((1600, 320), Image.Resampling.NEAREST))
        duration = [80] * len(frames)
        if action in (8, 11, 12):
            duration[-1] = 800
        frames[0].save(media / f'{SLUGS[action]}.gif', save_all=True,
                       append_images=frames[1:], duration=duration, loop=0, disposal=2)
        previews.append({'label': label + ' — five stored views',
                         'file': f'media/{ID}/{SLUGS[action]}.gif'})
    # Approved offline composites contain no client files or private paths.
    for original, name, label in [
        ('Riding_Walk.gif', 'riding-walk.gif', 'Mounted walk — male rider, offline preview'),
        ('Ride_Height_Male.png', 'rider-male.png', 'Male rider fit — eight views'),
        ('Ride_Height_Female.png', 'rider-female.png', 'Female rider fit — eight views'),
        ('Rider_Walk_Run_Contact.png', 'rider-walk-run.png', 'Mounted walk/run frame board'),
        ('All_Action_Poses.png', 'all-actions.png', 'All thirteen action poses')]:
        data = (source / 'Review' / original).read_bytes()
        (media / name).write_bytes(data if name.endswith('.gif') else png(Image.open(io.BytesIO(data))))
        previews.append({'label': label, 'file': f'media/{ID}/{name}'})
    payload['frames.json'] = json.dumps({'actions': ACTIONS, 'frames': native,
                                       'storedDirections': 5, 'displayedDirections': 8}, indent=2).encode()
    payload['Import_Notes.txt'] = (source / 'VD_Export/Import_Notes.txt').read_bytes()
    payload['README.txt'] = (
        'RIDEABLE OWLBEAR — APPROVED NATIVE ANIMATION\n\n'
        'Owlbear.vd contains 13 animal actions, 65 sequences and 300 frames.\n'
        'The included PNGs are tight native crops; frames.json preserves their centres.\n'
        'Five stored directions provide eight displayed views using normal mirroring.\n\n'
        'IMPORT AND MOUNT SETUP\n'
        'Back up your client data and test in a separate development copy.\n'
        'Close tools using the data, then import Owlbear.vd with UOFiddler into an\n'
        'unused compatible animal/mount body slot. Preserve its category and centres.\n'
        'Choose a free mount-item mapping and configure your server creature definition\n'
        'and client body routing to use your chosen body. This download assigns no IDs\n'
        'and installs no server script or client patch. Do not overwrite an occupied slot.\n\n'
        'Walk/run/stand use 5/5/1 frames to match the inspected mounted rider cycles.\n'
        'Offline male/female base-rider fit used zero additional Y offset. Verify the\n'
        'target client, equipped layers, terrain overlap, targeting, hues, corpse\n'
        'placement and actual playback in game. Animal slot 7 differs in name/routing\n'
        'between UOFiddler and ClassicUO; confirm it in your client/server.\n\n'
        'Previews: https://www.uoassets.com/?category=creatures&collection=Rideable-Owlbear#rideable-owlbear\n'
        'Animation previews use 80 ms per frame for inspection, not a timing patch.\n'
        'The approved VD was independently decoded with UOFiddler; all 300 frames,\n'
        'dimensions, transparency, RGB555 colours and centres matched its source.\n'
        'In-game mount integration remains a recipient test.\n'
    ).encode()
    # Distribution contains only native runtime artwork, metadata and public notes.
    for name, blob in payload.items():
        if not name.endswith(('.vd', '.png')):
            text = blob.decode('utf-8')
            if re.search(r'\b[A-Za-z]:[\\/]|Users[\\/]|accounts\.scp|sphereworld|api[_-]?token', text, re.I):
                raise ValueError('Private path or runtime data in public notes: ' + name)
    payload['SHA256SUMS.txt'] = ''.join(sha(blob) + '  ' + name + '\n'
                                      for name, blob in sorted(payload.items())).encode()
    target = gallery / 'downloads/creatures' / f'{ID}.zip'
    with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, blob in sorted(payload.items()):
            info = zipfile.ZipInfo(name, date_time=(2026, 10, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, blob)
    with zipfile.ZipFile(target) as archive:
        if archive.testzip() is not None or archive.read('Owlbear.vd') != vd:
            raise ValueError('Invalid published download')
    item = {'id': ID, 'name': 'Rideable Owlbear', 'project': 'Rideable-Owlbear',
            'category': 'Creatures and mounts', 'kind': 'motion',
            'notes': 'New approved Owlbear artwork: 13 native animal actions and eight views. '
                     'Five stored directions supply mirrored views. Preview timing is 80 ms; '
                     'the game controls playback. Mounted GIF and male/female fit boards are '
                     'offline base-rider previews. Import into a compatible unused body and '
                     'configure mount routing; equipped rider fitting and in-game tests remain.',
            'actions': 13, 'directions': 8, 'previews': previews,
            'thumbnail': f'media/{ID}/thumbnail.png', 'motion': f'media/{ID}/motion.js',
            'download': {'file': f'downloads/creatures/{ID}.zip',
                         'label': 'VD + native frames + import notes',
                         'status': 'Mount integration required',
                         'sizeBytes': target.stat().st_size, 'sha256': sha(target.read_bytes())}}
    catalog['items'].append(item)
    catalog_path.write_text('window.GALLERY=' + json.dumps(catalog, ensure_ascii=False,
                                                        separators=(',', ':')) + ';', encoding='utf-8')
    print(json.dumps({'id': ID, 'frames': frame_index, 'sequences': len(groups),
                      'previews': len(previews), 'zipBytes': target.stat().st_size,
                      'zipSha256': item['download']['sha256']}))


if __name__ == '__main__':
    main()
