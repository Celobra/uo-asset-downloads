/* Shared, DOM-free catalogue navigation. Existing asset IDs and files stay intact. */
(function (root) {
  'use strict';
  const categories = [
    {id:'equipment', name:'Armour & equipment', description:'Complete outfits, weapons, shields and spellbooks. Try on pieces and explore their animations.', project:'Armor-Collection'},
    {id:'creatures', name:'Creatures & mounts', description:'Monsters, companions and rideable creatures, with movement and action previews.', project:'Dragon-Mount-Revision'},
    {id:'effects', name:'Spell effects', description:'Fire, energy, auras and magical attacks. Watch an effect before downloading it.', project:'Fire-Nova'},
    {id:'buildings', name:'Buildings & items', description:'Houses, walls, furniture and caravans to bring your world to life.', project:'Existing-Tile-Cottage'},
    {id:'terrain', name:'Terrain & floors', description:'Trees, plants, seasonal scenery, ground tiles and flooring.', project:'Natural-Landscape'},
    {id:'interface', name:'Interface & gumps', description:'Windows, paperdolls, borders and separate buttons for your client interface.', project:'Invicta-Paperdolls'}
  ];
  const terrain = new Set(['Natural-Landscape','Natural-Landscape-Seasons','Flooring-Collection','Outdoor-Terrain-Collection','Sky-and-Shore-Floors']);
  const categoryOf = item => terrain.has(item.project) ? 'terrain' : ({Equipment:'equipment','Creatures and mounts':'creatures',Effects:'effects',Interface:'interface','World and items':'buildings','World items and housing':'buildings'})[item.category];
  const title = project => project.replaceAll('-', ' ').replace(/\bArmor\b/g,'Armour').replace(/\bDnD\b/g,'D&D');
  const searchText = text => text.toLowerCase().replaceAll('armour','armor').replaceAll('-', ' ');
  function create(records) {
    const items = records.filter(x => !x.parentSet), byId = new Map(records.map(x => [x.id,x]));
    const index = new Map(items.map(x => [x.id,searchText([x.name,x.project,x.category,...(x.pieces || []).map(p => byId.get(p.id)?.name || p.label)].join(' '))]));
    const collections = category => [...new Set(items.filter(x => categoryOf(x) === category).map(x => x.project))].sort((a,b) => title(a).localeCompare(title(b)));
    function normalize(state={}) {
      const category = categories.some(c => c.id === state.category) ? state.category : '';
      const collection = collections(category).includes(state.collection) ? state.collection : '';
      return {category, collection, q:String(state.q || '').trim().slice(0,150), all:!!category && !!state.all, page:Math.max(1,Math.min(10000,Math.floor(Number(state.page)) || 1)), sort:state.sort === 'za' ? 'za' : 'az'};
    }
    function read(search) {
      const p = new URLSearchParams(search);
      return normalize({category:p.get('category'),collection:p.get('collection'),q:p.get('q'),all:p.get('view') === 'all',page:p.get('page'),sort:p.get('sort')});
    }
    function href(path,state,hash='library') {
      const s=normalize(state), p=new URLSearchParams();
      if(s.category)p.set('category',s.category);
      if(s.collection)p.set('collection',s.collection);
      if(s.q)p.set('q',s.q);
      if(s.all && !s.collection)p.set('view','all');
      if(s.page > 1)p.set('page',s.page);
      if(s.sort !== 'az')p.set('sort',s.sort);
      return path+(p.size ? '?'+p : '')+(hash ? '#'+encodeURIComponent(hash) : '');
    }
    const mode = s => s.q || s.collection || s.all ? 'assets' : s.category ? 'collections' : 'categories';
    function results(s) {
      const words=searchText(s.q).split(/\s+/).filter(Boolean);
      return items.filter(x => (!s.category || categoryOf(x) === s.category) && (!s.collection || x.project === s.collection) && words.every(w => index.get(x.id).includes(w)))
        .sort((a,b) => (s.sort === 'za' ? -1 : 1) * a.name.localeCompare(b.name));
    }
    function listing(s) {
      const found=results(s), pages=Math.max(1,Math.ceil(found.length/24)), page=Math.min(s.page,pages);
      return {items:found.slice((page-1)*24,page*24), total:found.length, pages, page};
    }
    function context(id) {
      const requested=byId.get(id), item=requested?.parentSet ? byId.get(requested.parentSet) : requested;
      return item ? normalize({category:categoryOf(item),collection:item.project}) : null;
    }
    return {items,byId,collections,normalize,read,href,mode,results,listing,context};
  }
  root.GALLERY_NAV={categories,categoryOf,title,create};
})(typeof window === 'undefined' ? globalThis : window);
