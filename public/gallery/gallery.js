'use strict';
const $=id=>document.getElementById(id),all=window.GALLERY.items.filter(x=>!x.parentSet),images=new Map();let page=0,selected=null,motion=null,paperdoll=null,tick=0,playing=true,last=0,visibleParts=null,previewMode='animation',openRevision=0;
window.MOTION=window.MOTION||{};
const outfits=window.GALLERY_OUTFITS;let outfitChoice=null;
for(const c of [...new Set(all.map(x=>x.category))].sort())$('category').add(new Option(c,c));
for(const p of [...new Set(all.map(x=>x.project))].sort())$('project').add(new Option(p.replaceAll('-',' '),p));
$('totals').textContent=`${all.length} listings · ${all.filter(x=>x.pieces).length} complete armour sets · ${all.filter(x=>x.kind==='effect').length} effects`;
function filtered(){const q=$('search').value.trim().toLowerCase();return all.filter(x=>(!$('category').value||x.category===$('category').value)&&(!$('project').value||x.project===$('project').value)&&(!q||(x.name+' '+x.project+' '+x.category).toLowerCase().includes(q)))}
function nativeLink(item,compact=false){const d=item.download,a=document.createElement('a');a.className=compact?'card-download':'native-download';a.href=d.file;a.download=d.file.split('/').pop();a.textContent=compact?'↓ Download':`↓ Download ${d.label} · ZIP · ${fileSize(d.sizeBytes)}`;a.setAttribute('aria-label',`Download ${item.name}: ${d.label}`);a.title=`${d.label} · ${fileSize(d.sizeBytes)} · ${d.status}`;return a}
function fileSize(n){return n>=1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.ceil(n/1024))+' KB'}
function grid(){const items=filtered(),pages=Math.max(1,Math.ceil(items.length/30));page=Math.min(page,pages-1);$('grid').replaceChildren();for(const x of items.slice(page*30,page*30+30)){const card=document.createElement('article');card.className='card';card.dataset.id=x.id;const b=document.createElement('button');b.className='card-preview';b.type='button';const im=new Image();im.src=x.thumbnail;im.alt=x.name;im.loading='lazy';const text=document.createElement('span');text.className='text';const title=document.createElement('strong');title.textContent=x.name;const small=document.createElement('small');small.textContent=x.project.replaceAll('-',' ');const badge=document.createElement('span');badge.className='badge';badge.textContent=x.kind==='motion'?`${x.actions} actions · 8 views`:x.kind==='effect'?'Animated effect':x.kind==='animated'?'Animated preview':'Still artwork';text.append(title,small,badge);b.append(im,text);b.onclick=()=>openAsset(x.id);card.append(b);if(x.download)card.append(nativeLink(x,true));$('grid').append(card)}$('result-count').textContent=`${items.length} assets`;$('page-number').textContent=`${page+1} / ${pages}`;$('previous').disabled=page===0;$('next').disabled=page>=pages-1}
for(const id of ['search','category','project'])$(id).addEventListener('input',()=>{page=0;grid()});$('previous').onclick=()=>{page--;grid()};$('next').onclick=()=>{page++;grid()};
function loadImage(src){if(!images.has(src)){const im=new Image();const promise=new Promise((resolve,reject)=>{im.onload=()=>resolve(im);im.onerror=()=>reject(Error('Unable to load '+src))});im.src=src;images.set(src,{im,promise})}return images.get(src).promise}
function loadMotion(x){if(window.MOTION[x.id])return Promise.resolve(window.MOTION[x.id]);return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=x.motion;s.onload=()=>resolve(window.MOTION[x.id]);s.onerror=reject;document.head.append(s)})}
function downloadLinks(item){$('native-downloads').replaceChildren();if(item.download){$('native-downloads').append(nativeLink(item));const p=document.createElement('p');p.className='download-status';p.textContent=item.download.status;$('native-downloads').append(p)}$('downloads').replaceChildren();for(const p of item.previews){const a=document.createElement('a');a.href=p.file;a.download=p.file.split('/').pop();a.textContent=p.label+' · '+p.file.split('.').pop().toUpperCase();$('downloads').append(a)}}
function setupDownloads(item,pieceId){const hasPieces=!!item.pieces;$('download-choice-label').hidden=!hasPieces;$('download-note').hidden=!hasPieces;$('download-choice').replaceChildren();if(hasPieces){$('download-choice').add(new Option('Full set',item.id));for(const p of item.pieces)$('download-choice').add(new Option(p.label,p.id));$('download-choice').value=pieceId||item.id}downloadLinks(window.GALLERY.items.find(x=>x.id===(pieceId||item.id)))}
$('download-choice').onchange=()=>downloadLinks(window.GALLERY.items.find(x=>x.id===$('download-choice').value));
function pieceStatus(){if(selected?.pieces){$('piece-count').textContent=`${visibleParts.size} of ${selected.pieces.length} pieces shown`;for(const button of $('outfit-choices').querySelectorAll('button')){const preset=selected.outfits.find(o=>o.id===button.dataset.outfit);button.setAttribute('aria-pressed',String(preset.parts.length===visibleParts.size&&preset.parts.every(i=>visibleParts.has(i))));}}}
function refreshPieces(){for(const input of $('armor-pieces').querySelectorAll('input'))input.checked=visibleParts.has(Number(input.value));pieceStatus();render();renderPaperdoll();}
function setupPieces(item,pieceId){
 $('armor-pieces').replaceChildren();$('outfit-choices').replaceChildren();visibleParts=outfits.initial(item,pieceId);outfitChoice=item.outfits?.[0]?.id||null;
 $('armor-controls').hidden=!item.pieces;$('outfit-choices').hidden=!item.outfits;$('pieces-all').textContent=item.outfits?'Restore outfit':'Full set';
 for(const preset of item.outfits||[]){const button=document.createElement('button');button.type='button';button.dataset.outfit=preset.id;button.textContent=preset.label;button.onclick=()=>{outfitChoice=preset.id;visibleParts=outfits.preset(item,preset.id);refreshPieces();};$('outfit-choices').append(button);}
 for(const p of item.pieces||[]){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=p.partIndex;input.checked=visibleParts.has(p.partIndex);input.dataset.piece=p.id;input.onchange=()=>{visibleParts=outfits.toggle(item,visibleParts,p.partIndex,input.checked);refreshPieces();};label.append(input);if(p.icon){const im=new Image();im.src=p.icon;im.alt='';im.width=40;im.height=36;label.append(im);}label.append(document.createTextNode(p.label));$('armor-pieces').append(label);}pieceStatus();
}
function choosePieces(show){if(!selected?.pieces)return;visibleParts=show?outfits.preset(selected,outfitChoice):new Set();refreshPieces();}
$('pieces-all').onclick=()=>choosePieces(true);$('pieces-none').onclick=()=>choosePieces(false);
function setPreviewMode(mode){
 previewMode=selected?.paperdoll&&mode==='paperdoll'?'paperdoll':'animation';
 const isPaper=!!selected?.paperdoll&&previewMode==='paperdoll';
 $('equipment-preview').hidden=!selected?.paperdoll;
 $('paperdoll-canvas').hidden=!isPaper;
 $('paperdoll-note').hidden=!isPaper;
 $('canvas').hidden=selected?.kind!=='motion'||isPaper;
 $('motion-controls').hidden=selected?.kind!=='motion'||isPaper;
 $('paperdoll-view').setAttribute('aria-pressed',String(isPaper));
 $('animation-view').setAttribute('aria-pressed',String(!isPaper));
 if(isPaper)renderPaperdoll();else render();
}
$('paperdoll-view').onclick=()=>setPreviewMode('paperdoll');
$('animation-view').onclick=()=>setPreviewMode('animation');
async function openAsset(id){
 const requested=window.GALLERY.items.find(x=>x.id===id);if(!requested)return;
 const revision=++openRevision,pieceId=requested.parentSet?requested.id:null;
 selected=requested.parentSet?all.find(x=>x.id===requested.parentSet):requested;
 const x=selected;motion=null;paperdoll=null;visibleParts=null;tick=0;playing=true;
 $('paperdoll-canvas').width=$('canvas').width=1;
 $('armor-controls').hidden=true;$('body').value='both';$('play').textContent='Pause';
 $('name').textContent=x.name;$('notes').textContent=x.notes;
 $('detail-category').textContent=x.category+' / '+x.project.replaceAll('-',' ');
 setupDownloads(x,pieceId);$('still').hidden=x.kind==='motion';$('still-controls').hidden=x.kind==='motion';
 setPreviewMode(x.paperdoll?'paperdoll':'animation');
 if(!$('detail').open)$('detail').showModal();
 document.body.classList.add('modal-open');history.replaceState(null,'',location.pathname+location.search+'#'+id);
 if(x.kind==='motion'){
  try{
   const data=await loadMotion(x);if(revision!==openRevision)return;
   const files=[...data.parts,...Object.values(data.bodies||{})].map(p=>p.file);
   if(x.paperdoll)files.push(...Object.values(x.paperdoll.bodies),...x.paperdoll.parts.flatMap(p=>[p.male,p.female]));
   await Promise.all([...new Set(files)].map(loadImage));if(revision!==openRevision)return;
   motion=data;paperdoll=x.paperdoll||null;setupPieces(x,pieceId);
   $('action').replaceChildren(...data.actions.map((s,i)=>new Option(s,i)));$('action').value='0';
   $('facing').replaceChildren(...Array.from({length:8},(_,i)=>new Option('View '+(i+1)+(i>4?' · mirrored':''),i)));$('facing').value='1';
   render();renderPaperdoll();
  }catch(e){if(revision===openRevision){$('notes').textContent='Preview could not be loaded. '+e.message;console.error(e)}}
 }else{$('preview').replaceChildren(...x.previews.map((p,i)=>new Option(p.label,i)));showStill()}
}
function showStill(){const p=selected.previews[+$('preview').value];$('still').src=p.file;$('still').alt=selected.name+' — '+p.label}$('preview').onchange=showStill;
function close(){++openRevision;$('detail').close();document.body.classList.remove('modal-open');selected=null;motion=null;paperdoll=null;history.replaceState(null,'',location.pathname+location.search)}$('close').onclick=close;$('detail').addEventListener('cancel',e=>{e.preventDefault();close()});
function renderPaperdoll(){
 if(!paperdoll)return;
 const sex=$('body').value,views=sex==='both'||sex==='none'?['male','female']:[sex],c=$('paperdoll-canvas');
 c.width=paperdoll.width*views.length*2;c.height=paperdoll.height*2;
 const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;
 ctx.fillStyle='#161b20';ctx.fillRect(0,0,c.width,c.height);ctx.scale(2,2);
 views.forEach((s,i)=>{
  const x=i*paperdoll.width;
  if(sex!=='none')ctx.drawImage(images.get(paperdoll.bodies[s]).im,x,0);
  const ordered=paperdoll.drawOrder?paperdoll.drawOrder.map(i=>paperdoll.parts[i]):paperdoll.parts;
  for(const part of ordered)if(!visibleParts||visibleParts.has(part.partIndex))ctx.drawImage(images.get(part[s]).im,x,0);
 });
 const label=views.length===2?'Male on the left, female on the right.':views[0]==='male'?'Male paperdoll.':'Female paperdoll.';
 $('paperdoll-note').textContent=label+(sex==='none'?' Body hidden.':'')+(selected.pieces?' Untick a piece below to remove it.':'');
 c.setAttribute('aria-label',selected.name+' equipped paperdoll. '+label);
}
function drawPack(ctx,p,g,t,ox,oy){const fs=p.groups[g];if(!fs?.length)return;const [i,w,h,cx,cy]=fs[t%fs.length],im=images.get(p.file).im;ctx.drawImage(im,(i%p.columns)*p.tile,Math.floor(i/p.columns)*p.tile,w,h,ox-cx,oy-h-cy,w,h)}
function frameCount(){if(!motion)return 1;const d=+$('facing').value,g=+$('action').value*5+(d>4?8-d:d);return Math.max(1,...motion.parts.map(p=>p.groups[g]?.length||0))}
function render(){if(!motion)return;const [w,h,ox,oy]=motion.viewport,d=+$('facing').value,g=+$('action').value*5+(d>4?8-d:d),sex=$('body').value,bodies=motion.bodies,views=!bodies||sex==='none'?[null]:sex==='both'?['male','female']:[sex],c=$('canvas');c.width=w*views.length*2;c.height=h*2;const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.fillStyle='#161b20';ctx.fillRect(0,0,c.width,c.height);ctx.scale(2,2);tick%=frameCount();views.forEach((s,i)=>{ctx.save();ctx.translate(i*w,0);if(d>4){ctx.translate(w,0);ctx.scale(-1,1)}if(s)drawPack(ctx,bodies[s],g,tick,ox,oy);motion.parts.forEach((p,index)=>{if(!visibleParts||visibleParts.has(index))drawPack(ctx,p,g,tick,ox,oy)});ctx.restore()});$('frame').max=frameCount()-1;$('frame').value=tick;$('frame-count').textContent=`${tick+1} / ${frameCount()}`}
for(const id of ['action','facing'])$(id).onchange=()=>{tick=0;render()};$('body').onchange=()=>{tick=0;render();renderPaperdoll()};$('play').onclick=()=>{playing=!playing;$('play').textContent=playing?'Pause':'Play'};$('frame').oninput=()=>{playing=false;$('play').textContent='Play';tick=+$('frame').value;render()};
function animate(now){if(motion&&previewMode==='animation'&&playing&&now-last>=+$('speed').value){tick++;render();last=now}requestAnimationFrame(animate)}grid();requestAnimationFrame(animate);const initial=decodeURIComponent(location.hash.slice(1));if(window.GALLERY.items.some(x=>x.id===initial))openAsset(initial);
