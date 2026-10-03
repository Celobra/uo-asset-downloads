import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../public/gallery/', import.meta.url);
const catalog = JSON.parse((await readFile(new URL('catalog.js', root), 'utf8')).slice('window.GALLERY='.length, -1));
const release = JSON.parse(await readFile(new URL('../data/new-assets-release.json', import.meta.url), 'utf8'));

test('The new release contains twenty D&D creatures, separate mounts/demons, fifty layouts, a labelled study and a town builder', () => {
  assert.equal(release.addedItems, 78);
  assert.equal(release.items.length, new Set(release.items).size);
  assert.equal(catalog.items.filter(x => x.project === 'DnD-Native-Creatures').length, 20);
  assert.equal(catalog.items.filter(x => x.project === 'Landscape-Assemblies').length, 50);
  assert.equal(release.nativeCreatures.length, 26);
  assert.equal(release.nativeCreatures.reduce((n, x) => n + x.frames, 0), 8730);
  for (const id of release.items) assert.ok(catalog.items.some(x => x.id === id), id);
  const study = catalog.items.find(x => x.id === 'ashhorn-tiefling-study');
  assert.equal(study.directions, 2);
  assert.match(study.download.status, /Study only/);
  assert.ok(!study.motion);
  assert.match(catalog.items.find(x => x.id === 'britannia-architect').download.label, /Windows application/);
});

test('Every new native animation retains its real action IDs and unclipped frames in all eight displayed facings', async () => {
  for (const audit of release.nativeCreatures) {
    const item = catalog.items.find(x => x.id === audit.id);
    const scope = { window: {} };
    vm.runInNewContext(await readFile(new URL(item.motion, root), 'utf8'), scope);
    const motion = scope.window.MOTION[item.id];
    const part = motion.parts[0];
    assert.deepEqual(Array.from(motion.nativeActionIds), audit.nativeActionIds);
    assert.equal(part.groups.length, audit.groups);
    assert.equal(part.groups.flat().length, audit.frames);
    assert.equal(part.groups.length, motion.actions.length * 5);
    assert.equal(item.actions, motion.actions.length);
    assert.equal(motion.frameMs, 80);
    const seen = new Set();
    const [width, height, ox, oy] = motion.viewport;
    for (let a = 0; a < motion.actions.length; a++) {
      assert.ok(item.previews.some(p => p.file.endsWith(`action-${String(motion.nativeActionIds[a]).padStart(2, '0')}.gif`)));
      for (let facing = 0; facing < 8; facing++) {
        const group = part.groups[a * 5 + (facing > 4 ? 8 - facing : facing)];
        assert.equal(group.length, part.groups[a * 5].length);
        for (const [index, w, h, cx, cy] of group) {
          assert.ok(w > 0 && h > 0 && w <= part.tile && h <= part.tile);
          const x = facing > 4 ? width - (ox - cx) - w : ox - cx;
          assert.ok(x >= 0 && x + w <= width, `${item.id}: facing ${facing}`);
          assert.ok(oy - h - cy >= 0 && oy - cy <= height, item.id);
          seen.add(index);
        }
      }
    }
    assert.equal(seen.size, audit.frames);
    assert.deepEqual([...seen].sort((a,b) => a-b), Array.from({ length: audit.frames }, (_, i) => i));
    if (audit.mount) {
      for (const sex of ['male', 'female']) {
        assert.ok(item.previews.some(p => p.file.endsWith(`rider-${sex}.png`)));
        for (const action of [0,1]) assert.ok(item.previews.some(p => p.file.endsWith(`rider-${sex}-${action}.gif`)));
      }
    }
  }
  const hook = release.nativeCreatures.find(x => x.id === 'dnd-native-hook-horror');
  assert.equal(hook.capacity, 22);
  assert.equal(hook.nativeActionIds.length, 19);
  assert.ok(!hook.nativeActionIds.includes(19), 'Unprovided flight slots are not exposed');
  const ironmaw = release.nativeCreatures.find(x => x.id === 'ironmaw');
  assert.equal(ironmaw.capacity, 22);
  assert.equal(ironmaw.nativeActionIds.length, 15);
  assert.ok(!ironmaw.nativeActionIds.includes(7), 'Sparse native IDs remain sparse');
});
