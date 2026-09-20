import { readFile, stat } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export async function validateGallery(root = fileURLToPath(new URL('../public/gallery/', import.meta.url))) {
  const script = await readFile(resolve(root, 'catalog.js'), 'utf8');
  if (!script.startsWith('window.GALLERY=') || !script.endsWith(';')) throw Error('Invalid gallery catalogue');
  const { items } = JSON.parse(script.slice('window.GALLERY='.length, -1));
  const ids = new Map(items.map(item => [item.id, item]));
  if (ids.size !== items.length) throw Error('Duplicate gallery ID');
  const checked = new Map();
  async function checkFile(key) {
    if (!/^[a-zA-Z0-9_./-]+$/.test(key) || key.split('/').includes('..')) throw Error('Unsafe asset path');
    const target = resolve(root, key);
    if (relative(root, target).startsWith('..' + sep)) throw Error('Asset outside gallery');
    if (!checked.has(key)) {
      const info = await stat(target);
      if (!info.isFile() || info.size > 25 * 1024 * 1024) throw Error('Invalid/oversized asset: ' + key);
      checked.set(key, info.size);
    }
    return target;
  }
  const packages = new Map();
  let paperdolls = 0;
  for (const item of items) {
    await checkFile(item.thumbnail);
    for (const preview of item.previews) await checkFile(preview.file);
    if (item.motion) await checkFile(item.motion);
    const d = item.download;
    if (!d || !d.file.startsWith('downloads/') || !d.file.endsWith('.zip') || !d.label || !d.status) throw Error('Missing game download: ' + item.id);
    const target = await checkFile(d.file);
    if (!packages.has(d.file)) packages.set(d.file, createHash('sha256').update(await readFile(target)).digest('hex'));
    if (packages.get(d.file) !== d.sha256 || checked.get(d.file) !== d.sizeBytes) throw Error('Download checksum/size mismatch: ' + item.id);
    if (item.parentSet && !ids.get(item.parentSet)?.pieces?.some(p => p.id === item.id)) throw Error('Unlinked armour piece');
    for (const p of item.pieces || []) if (ids.get(p.id)?.parentSet !== item.id) throw Error('Incomplete armour set');
    if (item.category === 'Equipment') {
      const paper = item.paperdoll;
      if (!paper || paper.width !== 260 || paper.height !== 237 || !Array.isArray(paper.parts)) throw Error('Missing equipped paperdoll: ' + item.id);
      for (const sex of ['male', 'female']) await checkFile(paper.bodies?.[sex]);
      const expected = item.pieces || [{ id: item.id, partIndex: 0 }];
      if (paper.parts.length !== expected.length) throw Error('Incomplete paperdoll set: ' + item.id);
      for (let i = 0; i < expected.length; i++) {
        const part = paper.parts[i];
        if (part.id !== expected[i].id || part.partIndex !== expected[i].partIndex) throw Error('Paperdoll piece does not match animation: ' + item.id);
        for (const sex of ['male', 'female']) await checkFile(part[sex]);
      }
      paperdolls++;
    }
  }
  return { items: items.length, listings: items.filter(x => !x.parentSet).length, sets: items.filter(x => x.pieces).length, packages: packages.size, paperdolls };
}
