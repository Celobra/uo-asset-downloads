import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('The Abyss portal keeps all three states and both sizes without claiming automatic spawning', async () => {
  const context={window:{}};
  vm.runInNewContext(await readFile(new URL('../public/gallery/catalog.js',import.meta.url),'utf8'),context);
  const item=context.window.GALLERY.items.find(x=>x.id==='abyss-summoning-portal');
  assert.ok(item);
  assert.equal(item.kind,'effect');
  assert.equal(item.directions,1);
  assert.match(item.notes,/active loop repeats indefinitely until an external script requests closing/);
  assert.match(item.notes,/No monsters, spawning scripts/);
  assert.match(item.notes,/target-client behaviour is untested/);
  for(const size of ['Standard','Large']) for(const phase of ['opening','active','closing']) {
    assert.ok(item.previews.some(p=>p.label.startsWith(`${size} ${phase}`)));
  }
  const audit=JSON.parse(await readFile(new URL('../data/abyss-portal-release.json',import.meta.url),'utf8'));
  assert.deepEqual(audit.states,{opening:24,active:24,closing:20});
  assert.equal(audit.pngBmpNativeTriplesChecked,136);
  assert.equal(audit.clientRuntimeTested,false);
  assert.equal(audit.activeAutomaticExit,false);
});
