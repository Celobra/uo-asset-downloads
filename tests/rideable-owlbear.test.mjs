import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../public/gallery/', import.meta.url);
const script = await readFile(new URL('catalog.js', root), 'utf8');
const catalog = JSON.parse(script.slice('window.GALLERY='.length, -1));

test('Rideable Owlbear exposes all native frames without clipping any action or facing', async () => {
  const item = catalog.items.find(x => x.id === 'rideable-owlbear');
  assert.ok(item);
  assert.ok(catalog.items.some(x => x.id === 'owlbear'), 'Original Owlbear stays available');
  const scope = { window: {} };
  vm.runInNewContext(await readFile(new URL(item.motion, root), 'utf8'), scope);
  const motion = scope.window.MOTION[item.id];
  assert.equal(motion.actions.length, 13);
  assert.equal(motion.frameMs, 80);
  assert.equal(motion.parts[0].groups.length, 65);
  assert.equal(motion.parts[0].groups.flat().length, 300);
  const counts = [5, 5, 1, 5, 3, 5, 5, 5, 6, 5, 3, 6, 6];
  const [width, height, ox, oy] = motion.viewport;
  const seen = new Set();
  for (let action = 0; action < 13; action++) {
    for (let facing = 0; facing < 8; facing++) {
      const group = motion.parts[0].groups[action * 5 + (facing > 4 ? 8 - facing : facing)];
      assert.equal(group.length, counts[action]);
      for (const [index, w, h, cx, cy] of group) {
        assert.ok(w <= motion.parts[0].tile && h <= motion.parts[0].tile);
        assert.ok(ox - cx >= 0 && oy - h - cy >= 0);
        assert.ok(ox - cx + w <= width && oy - cy <= height);
        seen.add(index);
      }
    }
  }
  assert.equal(seen.size, 300);
  assert.equal(item.download.status, 'Mount integration required');
  assert.equal(item.previews.filter(p => p.file.endsWith('.gif')).length, 14);
  for (const sex of ['male', 'female']) {
    assert.ok(item.previews.some(p => p.file.endsWith(`rider-${sex}.png`)));
  }
});
