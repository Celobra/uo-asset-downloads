import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const scope={};vm.runInNewContext(readFileSync(new URL('../public/gallery/attached-effect.js',import.meta.url),'utf8'),scope);
const {state}=scope.GALLERY_ATTACHED_EFFECT;
const effect={file:'crown.png',tile:[72,144],columns:16,framesPerHeight:64,frameMs:50,anchor:[36,122],mountedActions:[23,24,25,26,27,28,29],hiddenActions:[21,22]};
test('Crown turns through 64 independent phases during standing and closes at 3.2 seconds',()=>{
 const seen=new Set(Array.from({length:64},(_,i)=>state(effect,4,i*50).index));
 assert.equal(seen.size,64);assert.equal(state(effect,4,3200).index,0);
 assert.equal(state(effect,4,3150).index,63);
});
test('Mounted poses select the higher native frames without shifting the shared ground anchor',()=>{
 for(let a=0;a<35;a++){
  const s=state(effect,a,200);
  if([21,22].includes(a)){assert.equal(s,null);continue;}
  assert.equal(s.index,a>=23&&a<=29?68:4);
  assert.equal(s.x,-36);assert.equal(s.y,-122);
  assert.ok(s.sx+s.width<=16*72);assert.ok(s.sy+s.height<=8*144);
 }
});
test('Other equipment has no attached-effect state',()=>assert.equal(state(undefined,4,250),null));
