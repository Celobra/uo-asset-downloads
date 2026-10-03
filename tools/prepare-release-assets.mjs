// Materialize verified release bundles before building the static website.
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';

const site = fileURLToPath(new URL('../', import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const hash = /^[a-f0-9]{64}$/;
const assetPath = /^gallery\/(?:media\/new-assets\/[a-z0-9.-]+|sheets\/[a-z0-9-]+\.png|downloads\/(?:creatures|world|tools)\/[a-z0-9-]+\.zip)$/;

export function validateReleaseManifest(manifest) {
  if (manifest.version !== 1 || !Array.isArray(manifest.bundles) || !Array.isArray(manifest.files)) throw Error('Invalid release manifest');
  const bundles = new Set(), paths = new Set();
  let total = 0;
  for (const b of manifest.bundles) {
    if (!/^assets-\d{2}\.zip$/.test(b.file) || bundles.has(b.file) || !hash.test(b.sha256) || !Number.isInteger(b.bytes) || b.bytes <= 0 || b.bytes > 25*1024*1024) throw Error('Invalid release bundle');
    bundles.add(b.file);
  }
  for (const f of manifest.files) {
    if (!assetPath.test(f.path) || f.path.includes('..') || paths.has(f.path) || !bundles.has(f.bundle) || !hash.test(f.sha256) || !Number.isInteger(f.bytes) || f.bytes <= 0 || f.bytes > 25*1024*1024) throw Error('Invalid release asset');
    paths.add(f.path); total += f.bytes;
  }
  if (total > 512*1024*1024 || !paths.size || !bundles.size) throw Error('Invalid release size');
  return total;
}

export function unpackReleaseBundle(blob, expected) {
  const wanted = new Map(expected.map(f => [f.path, f]));
  const result = new Map();
  let offset = 0;
  while (offset + 4 <= blob.length && blob.readUInt32LE(offset) === 0x04034b50) {
    if (offset + 30 > blob.length) throw Error('Truncated release header');
    const flags = blob.readUInt16LE(offset+6), method = blob.readUInt16LE(offset+8);
    const compressed = blob.readUInt32LE(offset+18), bytes = blob.readUInt32LE(offset+22);
    const nameLength = blob.readUInt16LE(offset+26), extraLength = blob.readUInt16LE(offset+28);
    const start = offset + 30 + nameLength + extraLength, end = start + compressed;
    if (flags & ~0x800 || ![0,8].includes(method) || end > blob.length) throw Error('Unsupported release archive');
    const name = blob.subarray(offset+30,offset+30+nameLength).toString('utf8');
    const entry = wanted.get(name);
    if (!entry || result.has(name) || bytes !== entry.bytes || !assetPath.test(name) || name.includes('..')) throw Error('Unexpected release member');
    const data = method === 0 ? blob.subarray(start,end) : inflateRawSync(blob.subarray(start,end), {maxOutputLength:entry.bytes});
    if (data.length !== entry.bytes || digest(data) !== entry.sha256) throw Error('Release member checksum mismatch: '+name);
    result.set(name,data); offset = end;
  }
  if (result.size !== wanted.size || offset+4 > blob.length || blob.readUInt32LE(offset) !== 0x02014b50) throw Error('Incomplete release archive');
  return result;
}

export async function prepareReleaseAssets(root = site) {
  const folder = resolve(root,'data/release-assets/2026-10-03');
  const manifest = JSON.parse(await readFile(resolve(folder,'manifest.json'),'utf8'));
  validateReleaseManifest(manifest);
  let written = 0;
  for (const bundle of manifest.bundles) {
    const blob = await readFile(resolve(folder,bundle.file));
    if (blob.length !== bundle.bytes || digest(blob) !== bundle.sha256) throw Error('Release bundle checksum mismatch: '+bundle.file);
    const members = unpackReleaseBundle(blob, manifest.files.filter(f => f.bundle === bundle.file));
    for (const [path,data] of members) {
      const target = resolve(root,'public',path);
      let matches = false;
      try { matches = (await stat(target)).size === data.length && digest(await readFile(target)) === digest(data); }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
      if (!matches) {
        await mkdir(dirname(target),{recursive:true});
        await writeFile(target,data); written++;
      }
    }
  }
  return {files:manifest.files.length,written,bundles:manifest.bundles.length};
}
