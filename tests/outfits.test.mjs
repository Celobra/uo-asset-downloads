import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const scope={window:{}};vm.createContext(scope);vm.runInContext(await readFile(new URL('../public/gallery/outfit-parts.js',import.meta.url),'utf8'),scope);const api=scope.window.GALLERY_OUTFITS;
const items=JSON.parse((await readFile(new URL('../public/gallery/catalog.js',import.meta.url),'utf8')).slice('window.GALLERY='.length,-1)).items;
test('Formalwear suit and dress choices never equip both neck items or both outer garments',()=>{
 const sets=items.filter(i=>i.project==='Formalwear-Collection'&&i.pieces);assert.equal(sets.length,5);
 for(const item of sets){assert.equal(api.initial(item).size,7);for(const preset of item.outfits){const shown=api.preset(item,preset.id);assert.equal(shown.size,preset.id==='suit'?7:4);for(const group of item.exclusiveParts)assert(group.filter(i=>shown.has(i)).length<=1);for(const i of shown)assert(item.paperdoll.parts.some(p=>p.partIndex===i));}
 for(const group of item.exclusiveParts){let shown=new Set(group);shown=api.toggle(item,shown,group[0],true);assert(shown.has(group[0]));assert(!shown.has(group[1]));shown=api.toggle(item,shown,group[1],true);assert(shown.has(group[1]));assert(!shown.has(group[0]));}
 for(const piece of item.pieces)assert.deepEqual([...api.initial(item,piece.id)],[piece.partIndex]);}
});
test('Existing equipment keeps its full set and independent piece controls',()=>{
 for(const item of items.filter(i=>i.pieces&&!i.outfits)){assert.equal(api.initial(item).size,item.pieces.length);for(const piece of item.pieces){const removed=api.toggle(item,api.initial(item),piece.partIndex,false);assert.equal(removed.size,item.pieces.length-1);assert.equal(api.toggle(item,removed,piece.partIndex,true).size,item.pieces.length);}}
});
test('Both website entry points load outfit controls before the viewer',async()=>{
 for(const page of ['../public/index.html','../public/gallery/index.html']){const html=await readFile(new URL(page,import.meta.url),'utf8');assert(html.includes('id="outfit-choices"'));assert(html.indexOf('src="outfit-parts.js"')<html.indexOf('src="gallery.js"'));}
});
