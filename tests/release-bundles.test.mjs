import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { validateReleaseManifest, unpackReleaseBundle, prepareReleaseAssets } from '../tools/prepare-release-assets.mjs';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const data = Buffer.from('public runtime artwork');
const file = {path:'gallery/media/new-assets/example.png',bundle:'assets-01.zip',bytes:data.length,sha256:digest(data)};
function fixture(path=file.path, bytes=data) {
  const name = Buffer.from(path), compressed = deflateRawSync(bytes), header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50); header.writeUInt16LE(8,8);
  header.writeUInt32LE(compressed.length,18);header.writeUInt32LE(bytes.length,22);header.writeUInt16LE(name.length,26);
  const central=Buffer.alloc(4);central.writeUInt32LE(0x02014b50);
  return Buffer.concat([header,name,compressed,central]);
}
const manifest = {version:1,bundles:[{file:'assets-01.zip',bytes:100,sha256:'a'.repeat(64)}],files:[file]};

test('Release manifest limits destinations, duplicate names and native hosting sizes', () => {
  assert.equal(validateReleaseManifest(manifest), data.length);
  for (const path of ['../outside.js','gallery/media/new-assets/../outside.js','studio/index.html','gallery/media/new-assets/../../credentials']) {
    assert.throws(() => validateReleaseManifest({...manifest,files:[{...file,path}]}),/Invalid release asset/);
  }
  assert.throws(() => validateReleaseManifest({...manifest,files:[file,file]}),/Invalid release asset/);
  assert.throws(() => validateReleaseManifest({...manifest,files:[{...file,bytes:26*1024*1024}]}),/Invalid release asset/);
  const oversized = Array.from({length:40},(_,i)=>({...file,path:`gallery/media/new-assets/item-${i}.png`,bytes:20*1024*1024}));
  assert.throws(() => validateReleaseManifest({...manifest,files:oversized}),/Invalid release size/);
});

test('Release unpacker refuses unknown members, altered bytes, incomplete archives and oversized output', () => {
  assert.deepEqual(unpackReleaseBundle(fixture(),[file]).get(file.path),data);
  assert.throws(() => unpackReleaseBundle(fixture('../outside.js'),[file]),/Unexpected release member/);
  assert.throws(() => unpackReleaseBundle(fixture(file.path,Buffer.from('changed runtime artwork')),[file]));
  assert.throws(() => unpackReleaseBundle(fixture().subarray(0,31),[file]));
  assert.throws(() => unpackReleaseBundle(fixture(),[{...file,sha256:'0'.repeat(64)}]),/checksum mismatch/);
  assert.throws(() => unpackReleaseBundle(fixture(),[file,{...file,path:'gallery/sheets/absent.png'}]),/Incomplete release archive/);
});

test('Dated releases restore together and refuse to replace earlier release paths', async () => {
  const root = await mkdtemp(join(tmpdir(),'uo-release-dates-'));
  try {
    for (const [date,path] of [['2026-10-03',file.path],['2026-10-16','gallery/media/new-assets/new.png']]) {
      const folder=join(root,'data/release-assets',date), blob=fixture(path);
      await mkdir(folder,{recursive:true});
      await writeFile(join(folder,'assets-01.zip'),blob);
      await writeFile(join(folder,'manifest.json'),JSON.stringify({version:1,bundles:[{file:'assets-01.zip',bytes:blob.length,sha256:digest(blob)}],files:[{...file,path}]}));
    }
    assert.deepEqual(await prepareReleaseAssets(root),{files:2,written:2,bundles:2});
    assert.deepEqual(await prepareReleaseAssets(root),{files:2,written:0,bundles:2});
    const path=join(root,'data/release-assets/2026-10-16/manifest.json');
    const duplicate=JSON.parse(await readFile(path,'utf8'));duplicate.files[0].path=file.path;
    await writeFile(path,JSON.stringify(duplicate));
    await assert.rejects(prepareReleaseAssets(root),/must not overwrite/);
    assert.deepEqual(await readFile(join(root,'public',file.path)),data);
  } finally { await rm(root,{recursive:true,force:true}); }
});
