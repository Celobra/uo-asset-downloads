import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const root=new URL('../public/gallery/',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const catalog=JSON.parse(read('catalog.js').slice('window.GALLERY='.length,-1));
const dwarfs=catalog.items.filter(x=>x.project==='Dwarf-Monsters');

function viewer(){
 const nodes=new Map(),draws=[];
 const ctx={fillRect(){},scale(){},save(){},restore(){},translate(){},drawImage(...args){assert.ok(args[0]);draws.push(args);}};
 function node(id=''){
  const n={id,value:'0',hidden:false,children:[],classList:{add(){},remove(){}},setAttribute(k,v){this[k]=v;},replaceChildren(...xs){this.children=xs;if(xs[0]?.value!==undefined)this.value=xs[0].value;},append(...xs){this.children.push(...xs);},add(x){this.children.push(x);},querySelectorAll(){return[];},addEventListener(){},getContext(){return ctx;},showModal(){this.open=true;},close(){this.open=false;}};return n;
 }
 const get=id=>{if(!nodes.has(id))nodes.set(id,node(id));return nodes.get(id);};
 let scope;
 const document={getElementById:get,createElement:()=>node(),createTextNode:text=>({text}),body:node(),head:{append(script){vm.runInContext(read(script.src),scope);script.onload();}}};
 class Image{set src(value){this.path=value;queueMicrotask(()=>this.onload());}}
 class Option{constructor(text,value){this.text=text;this.value=String(value);}}
 scope=vm.createContext({window:{GALLERY:catalog},document,Image,Option,console,requestAnimationFrame(){},queueMicrotask});
 for(const file of ['outfit-parts.js','attached-effect.js','gallery.js'])vm.runInContext(read(file),scope);
 return {scope,get,draws,open:async id=>{scope.target=id;await vm.runInContext('openAsset(target)',scope);}};
}

test('Dwarves expose every populated native action and share the complete runtime package',()=>{
 assert.equal(dwarfs.length,3);
 const scope={window:{}};
 for(const dwarf of dwarfs){
  vm.runInNewContext(read(dwarf.motion),scope);
  const motion=scope.window.MOTION[dwarf.id];
  assert.deepEqual(Array.from(motion.nativeActionIds),[0,1,2,3,4,5,6,10,11,12,13,15,16,17,18]);
  assert.equal(motion.actions.length,15);assert.equal(motion.frameMs,80);
  assert.equal(motion.parts[0].groups.length,75);
  assert.equal(motion.parts[0].groups.reduce((sum,g)=>sum+g.length,0),350);
  assert.ok(motion.parts[0].groups.every(g=>g.length>0));
  assert.equal(dwarf.portrait.width,260);assert.equal(dwarf.portrait.height,237);
  assert.equal(dwarf.download.file,'downloads/creatures/dwarf-monsters-full.zip');
 }
});

test('Dwarf viewer switches paperdolls, renders every facing/action and uses native preview cadence',async()=>{
 const v=viewer();
 for(const dwarf of dwarfs){
  await v.open(dwarf.id);
  assert.equal(v.get('equipment-preview').hidden,false);assert.equal(v.get('body-label').hidden,true);
  assert.equal(v.get('speed').value,'80');assert.equal(v.get('action').children.length,15);
  for(let a=0;a<15;a++)for(let d=0;d<8;d++){
   v.get('action').value=String(a);v.get('facing').value=String(d);v.get('action').onchange();
   assert.ok(Number(v.get('frame').max)>=0);
  }
  v.get('paperdoll-view').onclick();
  assert.equal(v.get('canvas').hidden,true);assert.equal(v.get('paperdoll-canvas').hidden,false);
  assert.equal(v.draws.at(-1)[0].path,dwarf.portrait.file);
  v.get('animation-view').onclick();assert.equal(v.get('paperdoll-canvas').hidden,true);
 }
 const equipment=catalog.items.find(x=>x.paperdoll&&!x.pieces&&!x.parentSet);
 assert.ok(equipment);await v.open(equipment.id);
 assert.equal(v.get('body-label').hidden,false);assert.equal(v.get('speed').value,'130');
 assert.ok(v.get('paperdoll-note').textContent.includes('Male on the left'));
});
