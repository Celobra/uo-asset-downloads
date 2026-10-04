import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { validateReleaseManifest, unpackReleaseBundle } from '../tools/prepare-release-assets.mjs';

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
