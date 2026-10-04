import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const root=new URL('../public/gallery/',import.meta.url);
const catalog=JSON.parse((await readFile(new URL('catalog.js',root),'utf8')).slice(15,-1));
const release=JSON.parse(await readFile(new URL('../data/oct3-packs-release.json',import.meta.url),'utf8'));

test('New packs preserve existing catalogue and distinguish native bodies from PNG-only exports',()=>{
  assert.equal(release.items.length,45);
  assert.equal(catalog.items.filter(i=>i.project==='DnD-Palette-Bestiary').length,15);
  assert.equal(catalog.items.filter(i=>i.project==='Fantasy-Races').length,24);
  assert.equal(release.pngFramesVerified,35392);
  for(const id of ['dnd-palette-lich','fantasy-race-gnome-proxy','fantasy-race-goblin']){
    const item=catalog.items.find(i=>i.id===id);
    assert.match(item.notes,/no VD/i);
    assert.doesNotMatch(item.download.label,/VD/);
  }
  const yard=catalog.items.find(i=>i.id==='uo-boatyard');
  assert.match(yard.notes,/62 scaffold pieces unchanged/);
  assert.match(yard.notes,/Decorative fixed hulls/);
});

test('New animation viewers retain source actions and registered frames inside the viewport',async()=>{
  for(const id of release.items){
    const item=catalog.items.find(i=>i.id===id);
    assert.ok(item.previews.length);
    if(!item.motion)continue;
    const context={window:{}};
    vm.runInNewContext(await readFile(new URL(item.motion,root),'utf8'),context);
    const motion=context.window.MOTION[id];
    assert.equal(motion.actions.length,item.actions);
    assert.equal(motion.nativeActionIds.length,item.actions);
    assert.equal(motion.parts[0].groups.length,item.actions*5);
    const [width,height,x,y]=motion.viewport;
    assert.equal(x,width/2,'Mirrored views preserve the same ground anchor');
    for(const group of motion.parts[0].groups){
      assert.ok(group.length);
      for(const [index,w,h,cx,cy] of group){
        assert.ok(Number.isInteger(index)&&index>=0);
        assert.ok(x-cx>=0&&x-cx+w<=width);
        assert.ok(y-h-cy>=0&&y-cy<=height);
      }
    }
  }
});
