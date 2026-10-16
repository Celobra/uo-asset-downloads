"""Prepare portable interface PNG packages from the verified custom artwork.

Original client archives, character artwork, prompts and private validation files
are deliberately outside the selected input manifests.
"""
import argparse, hashlib, json, re, shutil, zipfile
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('source', type=Path)
args = parser.parse_args()
source = args.source.resolve()
gallery = root / 'public/gallery'
out = root / '.publication-audit'
out.mkdir(exist_ok=True)
digest = lambda b: hashlib.sha256(b).hexdigest()

IMPORTER = r'''param(
    [ValidateRange(0,65535)][int]$BaseId = 57344,
    [string]$OutputPath = (Join-Path $PSScriptRoot 'Generated-Import.xml')
)
$ErrorActionPreference = 'Stop'
$packRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$manifest = Get-Content -LiteralPath (Join-Path $packRoot 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$outputFullPath = [IO.Path]::GetFullPath($OutputPath)
if (Test-Path -LiteralPath $outputFullPath) { throw 'The output already exists. Choose a new OutputPath.' }
$xml = [System.Xml.XmlDocument]::new()
$xml.AppendChild($xml.CreateXmlDeclaration('1.0','utf-8',$null)) | Out-Null
$list = $xml.CreateElement('MassImport')
$xml.AppendChild($list) | Out-Null
foreach ($image in $manifest.images) {
    $imagePath = [IO.Path]::GetFullPath((Join-Path $packRoot $image.file))
    if (-not $imagePath.StartsWith($packRoot + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'An image path leaves the package.' }
    $hasher = [Security.Cryptography.SHA256]::Create()
    $inputStream = [IO.File]::OpenRead($imagePath)
    try { $imageHash = [BitConverter]::ToString($hasher.ComputeHash($inputStream)).Replace('-','').ToLowerInvariant() }
    finally { $inputStream.Dispose(); $hasher.Dispose() }
    if ($imageHash -ne $image.sha256) { throw 'An image checksum does not match.' }
    $gumpId = if ($manifest.mode -eq 'reusable') { $BaseId + [int]$image.offset } else { [int]$image.referenceId }
    if ($gumpId -lt 0 -or $gumpId -gt 65535) { throw 'Choose a base ID whose complete block fits within 0..65535.' }
    $entry = $xml.CreateElement('gump')
    $entry.SetAttribute('index',[string]$gumpId)
    $entry.SetAttribute('file',$imagePath)
    $entry.SetAttribute('remove','False')
    $list.AppendChild($entry) | Out-Null
}
$stream = [IO.File]::Open($outputFullPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
try { $xml.Save($stream) } finally { $stream.Dispose() }
Write-Output ('Prepared ' + $manifest.images.Count + ' import entries. Review the IDs before importing: ' + $outputFullPath)
'''

def checked_rows(filename, exclude_original=False):
    rows = json.loads((source/filename).read_text(encoding='utf-8'))
    selected = [x for x in rows if not exclude_original or x['method'] != 'preserved_original_character_art']
    checked=[]
    for row in selected:
        path = (source/row['file']).resolve()
        assert path.is_relative_to(source)
        blob=path.read_bytes()
        assert digest(blob)==row['sha256'], row['file']
        with Image.open(path) as image:
            assert image.size==(row['width'],row['height'])
            image.verify()
        checked.append((row,blob))
    return checked

kit=checked_rows('kit_manifest.json')
replacements=checked_rows('replacement_manifest.json',True)
assert len(kit)==139 and len(replacements)==3394

# Bound the stored payload of each part; compressed public ZIPs remain <25 MiB.
parts=[[]]
size=0
for row,blob in replacements:
    if size+len(blob)>18*1024*1024:
        parts.append([]);size=0
    parts[-1].append((row,blob));size+=len(blob)

items=[]; public_files=[]; packages=[]
for index,records in enumerate([kit]+parts):
    reusable=index==0
    key='uopve-reusable-interface-kit' if reusable else f'uopve-gump-replacements-{index:02}'
    name='UO:PvE reusable interface kit' if reusable else f'UO:PvE gump replacements — part {index} of {len(parts)}'
    mode='reusable' if reusable else 'replacements'
    images=[];payload={}
    for offset,(row,blob) in enumerate(records):
        file='png/'+(Path(row['file']).stem.replace(' ','-') if reusable else f'gump-{row["id"]:04X}')+'.png'
        assert re.fullmatch(r'png/[A-Za-z0-9_-]+\.png',file)
        assert file not in payload, file
        payload[file]=blob
        images.append({'file':file,'referenceId':row['id'],'offset':offset,'width':row['width'],'height':row['height'],'sha256':digest(blob)})
    manifest={'version':1,'name':name,'mode':mode,'images':images}
    payload['manifest.json']=(json.dumps(manifest,indent=2)+'\n').encode()
    payload['Create-ImportList.ps1']=IMPORTER.encode()
    intro=('139 separate windows, frames, buttons, icons, text fields and status bars. Normal and pressed states are separate PNGs. The source reference block is E000–E08A. Select an unused recipient block; a reference ID is not an allocation on another shard.' if reusable else f'This is part {index} of {len(parts)} of the themed replacement artwork: {len(images)} PNGs in this part, 3,394 across the complete set. Each part is independent; use all parts for the complete selected theme. The 2,143 unchanged original character images are not distributed. The manifest lists original replacement slots, not fresh allocations.')
    text=f'''# {name}

{intro}

These are image assets for a development client or custom server interface.
They are not a player client, launcher, finished server UI installation, or a
change to skills, quests, accounts or game rules. No game archives or client
executables are included. Source PNG dimensions and bytes are preserved.

## Use the artwork

1. Extract this ZIP. Preserve the png folder and manifest.json together.
2. Back up a development copy of the recipient client. Review the dimensions,
   controls and proposed IDs in your gump editor before changing any game file.
3. For a reusable kit, choose a free block large enough for all 139 images.
   For replacement parts, compare the supplied reference slots with the actual
   recipient UI. Different client forks can assign or compose those slots
   differently. Do not import the reference list over an unknown client.
4. Import individual PNGs using your gump editor. The optional PowerShell helper
   creates a UOFiddler MassImport XML with absolute paths for your extracted
   folder. It verifies every PNG checksum and never installs anything.
   Run Create-ImportList.ps1 for the reference mapping; reusable kits also accept
   -BaseId with a reviewed free decimal base. Choose a different -OutputPath to
   retain an existing generated list. Review the resulting XML before importing.
5. Wire custom server dialogs or client layout code separately. Test hitboxes,
   labels, button states, scroll regions, scaling and readable text in game.

Changing artwork does not update client layout code or server dialog scripts.
The screenshots are artwork previews, not evidence of a universal client patch.
Personal installation paths, profiles, original character images, development
logs, source atlases and generation prompts are outside these public packages.
'''
    payload['README.md']=text.encode()
    payload['SHA256SUMS.txt']=''.join(f'{digest(blob)}  {file}\n' for file,blob in sorted(payload.items())).encode()
    target=gallery/'downloads/tools'/f'{key}.zip'
    target.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for file,blob in sorted(payload.items()):
            assert not re.search(rb'C:[\\/]|\\\\desktop-|generation_prompts|C:\\\\Users',blob,re.I) if file.endswith(('.md','.json','.ps1','.txt')) else True
            info=zipfile.ZipInfo(file,date_time=(2026,10,16,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
            z.writestr(info,blob)
    blob=target.read_bytes()
    assert len(blob)<25*1024*1024
    with zipfile.ZipFile(target) as z: assert z.testzip() is None
    download={'file':target.relative_to(gallery).as_posix(),'sizeBytes':len(blob),'sha256':digest(blob),'label':f'{len(images)} PNGs + verified manifest + import-list helper','status':'Recipient ID review, UI integration and in-client checks required'}
    preview_source=source/('reference/reusable_kit_preview.png' if reusable else 'previews/frame-families-1.png')
    media='media/new-assets/'+key+'-preview.png'
    (gallery/media).parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(preview_source,gallery/media)
    previews=[{'label':'Separate reusable controls and windows' if reusable else 'Themed frame artwork preview', 'file':media}]
    item={'id':key,'name':name,'project':'UOPvE-Interface-Artwork','category':'Interface','kind':'static','notes':intro+' PNG artwork only; UI wiring and recipient-client validation are separate. No complete client or game data is included.','thumbnail':media,'previews':previews,'download':download}
    items.append(item);public_files.extend([media,download['file']]);packages.append({'id':key,'images':len(images),'bytes':len(blob),'sha256':digest(blob)})

(out/'interface-items.json').write_text(json.dumps({'items':items,'publicFiles':public_files},indent=2)+'\n',encoding='utf-8')
(root/'data/uopve-interface-release.json').write_text(json.dumps({'date':'2026-10-16','images':len(kit)+len(replacements),'reusableImages':len(kit),'replacementImages':len(replacements),'omittedUnchangedCharacterImages':2143,'items':[i['id'] for i in items],'packages':packages},indent=2)+'\n',encoding='utf-8')
print(json.dumps({'items':len(items),'images':len(kit)+len(replacements),'packages':packages}))
