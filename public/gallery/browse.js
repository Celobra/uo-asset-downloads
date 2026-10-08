(function () {
  'use strict';
  const nav=window.GALLERY_NAV, model=nav.create(window.GALLERY.items), el=id=>document.getElementById(id);
  let state=model.read(location.search), lastURL='', activeAsset='', returnFocus='';
  const category=()=>nav.categories.find(c=>c.id===state.category);
  function node(tag,text,className){const n=document.createElement(tag);if(text)n.textContent=text;if(className)n.className=className;return n;}
  function routeLink(text,next,className){const a=node('a',text,className);a.href=model.href(location.pathname,next);a.dataset.browse='';return a;}
  function navigate(next){history.pushState(null,'',model.href(location.pathname,next));sync(true);}
  function imageFor(item){const image=new Image();image.src=item.thumbnail;image.alt='';image.loading='lazy';return image;}
  function tile(name,description,items,next,isCategory=false){
    const a=routeLink('',next,'browse-card'+(isCategory?' category-card':''));
    const art=node('div',null,'browse-art');
    for(const item of items.slice(0,isCategory?1:3))art.append(imageFor(item));
    const copy=node('div',null,'browse-copy');copy.append(node('h3',name),node('p',description));
    copy.append(node('span',isCategory?'Explore category →':'View collection →','browse-cta'));a.append(art,copy);return a;
  }
  function render(){
    const mode=model.mode(state), cat=category(), listing=model.listing(state);
    state.page=listing.page;
    window.GALLERY_BULK_DOWNLOADS.setPage(mode==='assets'?listing.items:[],{key:JSON.stringify([mode,state.category,state.collection,state.q,state.sort,listing.page]),label:state.collection?nav.title(state.collection):cat?.name||'search-results',page:listing.page});
    const crumb=el('breadcrumbs');crumb.replaceChildren();
    crumb.append(routeLink('All categories',{}));
    if(cat){crumb.append(node('span','/'));crumb.append(routeLink(cat.name,{category:cat.id}));}
    if(state.collection){crumb.append(node('span','/'));const current=node('span',nav.title(state.collection));current.setAttribute('aria-current','page');crumb.append(current);}
    if(!cat)crumb.firstChild.setAttribute('aria-current',mode==='categories'?'page':'false');
    el('browse-title').textContent=mode==='categories'?'What would you like to create?':state.q?'Search results':state.collection?nav.title(state.collection):cat.name;
    el('browse-description').textContent=mode==='categories'?'Choose a category, explore a collection, then preview and download your favourites.':mode==='collections'?cat.description+' Choose a collection below.':state.q?`Results for “${state.q}”${cat?' in '+cat.name:''}.`:'Select an item to explore its previews and download the game files.';
    el('search').value=state.q;el('search-label').textContent=cat?'Search '+cat.name.toLowerCase():'Search the whole library';
    el('search').placeholder=cat?'Search this category…':'Try dragon, armour, fire or cottage…';
    el('clear-search').hidden=!state.q;
    el('search-everywhere').hidden=!state.q || !cat;
    el('browse-cards').hidden=mode==='assets';el('asset-results').hidden=mode!=='assets';
    el('browse-cards').replaceChildren();el('grid').replaceChildren();el('browse-actions').replaceChildren();
    if(mode==='categories'){
      for(const c of nav.categories){
        const items=model.items.filter(x=>nav.categoryOf(x)===c.id), featured=items.find(x=>x.project===c.project)||items[0];
        const a=tile(c.name,c.description,[featured],{category:c.id},true);
        a.querySelector('.browse-copy').insertBefore(node('small',`${items.length} items · ${model.collections(c.id).length} collections`,'browse-count'),a.querySelector('.browse-cta'));
        el('browse-cards').append(a);
      }
    }else if(mode==='collections'){
      el('browse-actions').append(routeLink('View all '+cat.name.toLowerCase()+' →',{category:cat.id,all:true},'text-link'));
      for(const project of model.collections(cat.id)){
        const items=model.items.filter(x=>nav.categoryOf(x)===cat.id && x.project===project);
        el('browse-cards').append(tile(nav.title(project),`${items.length} ${items.length===1?'item':'items'} · Previews & downloads`,items,{category:cat.id,collection:project}));
      }
    }else{
      el('collection-filter').replaceChildren(new Option('All collections',''));
      for(const p of model.collections(state.category))el('collection-filter').add(new Option(nav.title(p),p));
      el('collection-filter').value=state.collection;el('collection-filter-label').hidden=!cat;
      el('sort').value=state.sort;
      el('result-count').textContent=listing.total?`${listing.total} ${listing.total===1?'item':'items'} · Showing ${(listing.page-1)*24+1}–${Math.min(listing.page*24,listing.total)}`:'No matching items';
      el('empty-results').hidden=listing.total!==0;
      for(const x of listing.items){
        const card=node('article',null,'card');card.dataset.id=x.id;
        const b=node('button',null,'card-preview');b.type='button';b.setAttribute('aria-label','Preview '+x.name);
        const im=imageFor(x), copy=node('span',null,'text');
        copy.append(node('strong',x.name),node('small',nav.title(x.project)),node('span',x.pieces?'Complete set · Choose individual pieces':x.kind==='motion'?`${x.actions} actions · 8 views`:x.kind==='effect'?'Animated effect':x.kind==='animated'?'Animated preview':'Still artwork','badge'));
        b.append(im,copy);b.onclick=()=>{returnFocus=x.id;openAsset(x.id);};card.append(b);
        if(x.download)card.append(window.GALLERY_BULK_DOWNLOADS.selectionControl(x),nativeLink(x,true));el('grid').append(card);
      }
      window.GALLERY_BULK_DOWNLOADS.refresh();
      el('pagination').hidden=listing.pages<=1;
      el('page-number').textContent=`Page ${listing.page} of ${listing.pages}`;el('previous').disabled=listing.page===1;el('next').disabled=listing.page===listing.pages;
      if(cat)el('browse-actions').append(routeLink('← Choose another collection',{category:cat.id},'text-link'));
    }
    el('browse-status').textContent=mode==='categories'?'6 categories available':mode==='collections'?`${model.collections(cat.id).length} collections in ${cat.name}`:el('result-count').textContent;
    document.title=(mode==='categories'?'UO Workshop · Custom Content & Downloads':el('browse-title').textContent+' · UO Workshop');
  }
  function hashId(){try{return decodeURIComponent(location.hash.slice(1));}catch{return '';}}
  function sync(focus=false){
    if(lastURL===location.href)return;lastURL=location.href;
    state=model.read(location.search);const id=hashId(), item=model.byId.get(id);
    // Old shared links still open the item, with its collection underneath.
    if(item && !state.category && !state.q){state=model.context(id);history.replaceState(history.state,'',model.href(location.pathname,state,id));lastURL=location.href;}
    render();
    if(item){if(activeAsset!==id){activeAsset=id;openAsset(id);}}
    else{activeAsset='';if(el('detail').open)close(false);if(focus){el('browse-title').focus();el('library').scrollIntoView({block:'start'});}
      else if(returnFocus){const card=[...el('grid').children].find(x=>x.dataset.id===returnFocus);card?.querySelector('button').focus({preventScroll:true});returnFocus='';}}
  }
  window.GALLERY_BROWSE={
    rememberAsset(id){activeAsset=id;if(hashId()===id)return;history.pushState({galleryPreview:true},'',model.href(location.pathname,state,id));lastURL=location.href;},
    closeItem(){activeAsset='';if(history.state?.galleryPreview)history.back();else{history.replaceState(null,'',model.href(location.pathname,state));lastURL='';sync();}}
  };
  document.addEventListener('click',event=>{
    const a=event.target.closest('a[data-browse]');if(!a || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button!==0)return;
    event.preventDefault();navigate(model.read(new URL(a.href).search));
  });
  el('search-form').addEventListener('submit',event=>{event.preventDefault();navigate({...state,collection:'',all:false,q:el('search').value,page:1});});
  el('clear-search').onclick=()=>navigate({...state,q:'',page:1});
  el('search-everywhere').onclick=()=>navigate({q:state.q});
  el('empty-reset').onclick=()=>navigate(state.category?{category:state.category}:{});
  el('collection-filter').onchange=()=>navigate({...state,collection:el('collection-filter').value,all:true,page:1});
  el('sort').onchange=()=>navigate({...state,sort:el('sort').value,page:1});
  el('previous').onclick=()=>navigate({...state,page:state.page-1});el('next').onclick=()=>navigate({...state,page:state.page+1});
  for(const a of document.querySelectorAll('.intro-links a[href="#library"], .skip-link'))a.href=location.pathname+'#library';
  window.addEventListener('popstate',()=>sync());window.addEventListener('hashchange',()=>sync());
  el('totals').textContent=`${model.items.length} items · 6 categories · Previews & game files`;
  sync();
})();
