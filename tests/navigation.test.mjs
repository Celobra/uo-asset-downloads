import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const root=new URL('../public/',import.meta.url), context={window:{},URLSearchParams};
for(const f of ['gallery/catalog.js','gallery/browse-model.js'])vm.runInNewContext(readFileSync(new URL(f,root),'utf8'),context);
const nav=context.window.GALLERY_NAV, model=nav.create(context.window.GALLERY.items);

test('Landing and category routes show navigation rather than the entire asset grid',()=>{
  assert.equal(model.mode(model.read('')),'categories');
  for(const c of nav.categories){
    assert.equal(model.mode(model.read('?category='+c.id)),'collections');
    assert.equal(model.mode(model.read('?category='+c.id+'&view=all')),'assets');
    assert.ok(model.collections(c.id).length);
  }
});
test('Every visible listing has exactly one populated category and collection',()=>{
  const ids=[];
  for(const c of nav.categories){
    for(const project of model.collections(c.id)){
      const items=model.results(model.normalize({category:c.id,collection:project}));
      assert.ok(items.length);ids.push(...items.map(x=>x.id));
    }
  }
  assert.equal(ids.length,452);assert.equal(new Set(ids).size,452);
  assert.ok(model.items.every(x=>!x.parentSet));
});
test('Search accepts armour/armor, multiple words and individual piece names without duplicate armour pieces',()=>{
  for(const q of ['armour','armor','fire nova'])assert.ok(model.results(model.normalize({q})).length,q);
  assert.equal(model.results(model.normalize({q:'fire nova'}))[0].id,'fire-nova');
  const child=context.window.GALLERY.items.find(x=>x.parentSet);
  assert.ok(model.results(model.normalize({q:child.name})).some(x=>x.id===child.parentSet));
  assert.ok(model.results(model.normalize({q:'armor'})).every(x=>!x.parentSet));
  assert.equal(model.results(model.normalize({category:'equipment',q:'fire nova'})).length,0);
});
test('Route parsing rejects mismatched collections and invalid categories; paging stays bounded',()=>{
  assert.equal(model.read('?category=equipment&collection=Fire-Nova').collection,'');
  assert.equal(model.mode(model.read('?category=unknown&view=all')),'categories');
  assert.equal(model.read('?page=-8').page,1);
  assert.equal(model.read('?page=Infinity').page,10000);
  const list=model.listing(model.normalize({category:'terrain',all:true,page:9999}));
  assert.equal(list.page,list.pages);assert.ok(list.items.length>0 && list.items.length<=24);
});
test('Shareable category, collection, search and page routes round-trip at both entry points',()=>{
  const state=model.normalize({category:'equipment',collection:'Armor-Collection',q:'a & b',sort:'za',page:2});
  for(const path of ['/','/gallery/']){
    const url=new URL(model.href(path,state),'https://example.test');
    assert.equal(url.pathname,path);assert.deepEqual(model.read(url.search),state);assert.equal(url.hash,'#library');
  }
});
test('Legacy item and individual-piece links retain the owning collection',()=>{
  const child=context.window.GALLERY.items.find(x=>x.parentSet);
  assert.equal(model.context('fire-nova').collection,'Fire-Nova');
  assert.equal(model.context(child.id).category,'equipment');
  assert.equal(model.context(child.id).collection,child.project);
  assert.equal(model.context('missing'),null);
});
test('Both pages include category browsing, accessible search and unchanged equipment viewer controls',()=>{
  for(const f of ['index.html','gallery/index.html']){
    const html=readFileSync(new URL(f,root),'utf8');
    for(const id of ['breadcrumbs','browse-title','browse-cards','search-form','asset-results','collection-filter','armor-pieces','native-downloads'])assert.ok(html.includes(`id="${id}"`),`${f}: ${id}`);
    assert.match(html,/<section id="asset-results"[^>]+hidden>/);
    assert.ok(html.indexOf('src="browse-model.js"')<html.indexOf('src="browse.js"'));
    assert.match(html,/aria-labelledby="name"/);
  }
  const home=readFileSync(new URL('index.html',root),'utf8');
  assert.ok(home.indexOf('id="library"')<home.indexOf('id="studio-spotlight"'));
});
