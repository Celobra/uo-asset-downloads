import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';

const read=async name=>JSON.parse(await readFile(new URL('../'+name,import.meta.url),'utf8'));
const gallery=new URL('../public/gallery/',import.meta.url);
const catalog=JSON.parse((await readFile(new URL('catalog.js',gallery),'utf8')).slice(15,-1));
const completed=await read('data/oct16-assets-release.json');
const prototypes=await read('data/oct16-prototypes-release.json');
const release=await read('data/release-assets/2026-10-16/manifest.json');
const ids=new Map(catalog.items.map(i=>[i.id,i]));
const sha=blob=>createHash('sha256').update(blob).digest('hex');

test('October artwork retains all 1,140 earlier catalogue records exactly',()=>{
  assert.equal(sha(JSON.stringify(catalog.items.slice(0,1140))),'3030506cf42907f648f9a9f3dbc20b3356ea91b6648b728344963ed810eb8e3d');
  assert.equal(completed.items.length,84);
  assert.equal(prototypes.items.length,15);
  assert.equal(new Set([...completed.items,...prototypes.items]).size,99);
  assert.equal(catalog.items.filter(i=>i.project==='Moving-Terrain').length,9);
  assert.equal(catalog.items.filter(i=>i.project==='Terrain-Roads-and-Corners').length,36);
  assert.equal(catalog.items.filter(i=>i.project.endsWith('-NPC-Roles-V2')).length,20);
  assert.equal(catalog.items.filter(i=>i.project==='Greek-Mythology').length,6);
  assert.equal(catalog.items.filter(i=>i.project==='Flying-Books').length,6);
});

test('Moving terrain and roads describe their actual native formats and scope',()=>{
  assert.deepEqual(completed.counts,{nativeStaticRecords:1701,nativeLandRecords:4824,nativeAnimationFrames:23220,pngAnimationFrames:37312});
  const source=completed.sources.find(s=>s.archive==='UO_Moving_Terrain.zip');
  assert.equal(source.sha256,'2bf871ca9ecc77ba4881d0da45fb24da509fc1ea75f3848a1cfc5db30f714785');
  for(const item of catalog.items.filter(i=>i.project==='Moving-Terrain')){
    assert.match(item.notes,/four adjoining 44 × 44 tiles, 32 frames per tile/);
    assert.match(item.notes,/Animated static\/item art/);
    assert.match(item.notes,/Replacing ordinary map land does not install animation/);
  }
  for(const item of catalog.items.filter(i=>i.project==='Terrain-Roads-and-Corners')){
    assert.match(item.notes,/134 shaped/);
    assert.match(item.notes,/two contrasting backgrounds/);
  }
  const medusa=ids.get('greek-mythology-medusa');
  assert.match(medusa.notes,/no VD is supplied/);
  assert.doesNotMatch(medusa.download.label,/VD/);
});

test('Original monster prototypes remain explicit studies with five supplied actions',async()=>{
  assert.equal(prototypes.counts.nativeAnimationFrames,875);
  assert.equal(prototypes.counts.pngAnimationFrames,1400);
  for(const id of prototypes.items){
    const item=ids.get(id);
    assert.match(item.name,/animation prototype/i);
    assert.match(item.notes,/five populated slots out of 22/i);
    assert.match(item.notes,/artist cleanup/i);
    assert.match(item.download.status,/Prototype/);
    assert.equal(item.actions,5);
    const context={window:{}};
    vm.runInNewContext(await readFile(new URL(item.motion,gallery),'utf8'),context);
    assert.deepEqual(Array.from(context.window.MOTION[id].nativeActionIds),[0,1,2,4,10]);
  }
  assert.match(ids.get('original-prototype-mimic').notes,/incorrect front-facing detail/);
  assert.match(ids.get('original-prototype-bulette').notes,/incorrect front-facing detail/);
  assert.match(ids.get('original-prototype-gelatinous-cube').notes,/does not provide see-through/);
});

test('New motion views keep every registered frame inside a symmetric viewport',async()=>{
  for(const id of [...completed.items,...prototypes.items]){
    const item=ids.get(id);
    if(!item.motion)continue;
    const context={window:{}};
    vm.runInNewContext(await readFile(new URL(item.motion,gallery),'utf8'),context);
    const motion=context.window.MOTION[id];
    assert.equal(motion.actions.length,item.actions);
    assert.equal(motion.parts[0].groups.length,item.actions*5);
    const [w,h,x,y]=motion.viewport;
    assert.equal(x,w/2);
    for(const group of motion.parts[0].groups){
      assert.ok(group.length);
      for(const [index,width,height,cx,cy] of group){
        assert.ok(Number.isInteger(index)&&index>=0);
        assert.ok(x-cx>=0&&x-cx+width<=w,id);
        assert.ok(y-height-cy>=0&&y-cy<=h,id);
      }
    }
  }
});

test('New artwork downloads and media are selected by the dated release manifest',()=>{
  const paths=new Set(release.files.map(f=>f.path));
  assert.equal(paths.size,release.files.length);
  assert.ok(release.bundles.every(b=>b.bytes<=25*1024*1024));
  assert.ok(release.files.every(f=>f.bytes<=25*1024*1024));
  for(const id of [...completed.items,...prototypes.items]){
    const item=ids.get(id);
    for(const name of [item.download.file,item.thumbnail,...item.previews.map(p=>p.file),...(item.motion?[item.motion,'sheets/'+id+'.png']:[])]){
      assert.ok(paths.has('gallery/'+name),name);
    }
    const file=release.files.find(f=>f.path==='gallery/'+item.download.file);
    assert.equal(file.sha256,item.download.sha256);
    assert.equal(file.bytes,item.download.sizeBytes);
  }
});
