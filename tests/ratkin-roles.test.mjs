import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const root=new URL('../public/gallery/',import.meta.url);
const catalog=JSON.parse((await readFile(new URL('catalog.js',root),'utf8')).slice(15,-1));
const release=JSON.parse(await readFile(new URL('../data/ratkin-roles-release.json',import.meta.url),'utf8'));

test('Original Ratkin roles retain complete humanoid coverage and disclose equipment and runtime limits',()=>{
  assert.equal(release.items.length,5);
  assert.equal(release.nativeFramesVerified,5250);
  assert.equal(release.pngFramesVerified,8400);
  assert.equal(release.nativeRecordsVerified,875);
  assert.equal(release.clientRuntimeTested,false);
  for(const id of release.items){
    const item=catalog.items.find(i=>i.id===id);
    assert.equal(item.project,'Ratkin-NPC-Roles');
    assert.equal(item.actions,35);
    assert.equal(item.directions,8);
    assert.match(item.notes,/baked-in/);
    assert.match(item.notes,/client runtime not tested/);
    assert.match(item.notes,/equipment fitting/i);
    assert.equal(item.previews.filter(p=>p.file.includes('-action-')).length,35);
    assert.equal(item.previews.filter(p=>p.file.includes('-mounted-fit-')).length,7);
  }
});

test('Ratkin players keep all 1050 stored frames and unclipped mirrored ground anchors',async()=>{
  for(const id of release.items){
    const item=catalog.items.find(i=>i.id===id),context={window:{}};
    vm.runInNewContext(await readFile(new URL(item.motion,root),'utf8'),context);
    const motion=context.window.MOTION[id],part=motion.parts[0];
    assert.deepEqual(Array.from(motion.nativeActionIds),Array.from({length:35},(_,i)=>i));
    assert.equal(part.groups.length,175);
    assert.equal(part.groups.reduce((n,g)=>n+g.length,0),1050);
    const [width,height,x,y]=motion.viewport;
    assert.equal(x,width/2);
    for(const group of part.groups)for(const [index,w,h,cx,cy] of group){
      assert.ok(index>=0 && index<1050);
      assert.ok(x-cx>=0 && x-cx+w<=width);
      assert.ok(y-h-cy>=0 && y-cy<=height);
      assert.ok(x-(w-cx)>=0 && x-(w-cx)+w<=width);
    }
  }
});
