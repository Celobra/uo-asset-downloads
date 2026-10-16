import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const release=JSON.parse(await readFile(new URL('data/wallpapers-release.json',root),'utf8'));
const page=await readFile(new URL('public/wallpapers/index.html',root),'utf8');
const zip=await readFile(new URL('public/gallery/'+release.offline.file,root));
const sha=b=>createHash('sha256').update(b).digest('hex');
const payload=new Map();
for(let offset=0;offset+30<zip.length&&zip.readUInt32LE(offset)===0x04034b50;){
  const flags=zip.readUInt16LE(offset+6),method=zip.readUInt16LE(offset+8),size=zip.readUInt32LE(offset+18);
  const nameSize=zip.readUInt16LE(offset+26),extraSize=zip.readUInt16LE(offset+28);
  assert.equal(flags&8,0);
  const name=zip.subarray(offset+30,offset+30+nameSize).toString('utf8');
  const start=offset+30+nameSize+extraSize,end=start+size;
  payload.set(name,method===8?inflateRawSync(zip.subarray(start,end)):zip.subarray(start,end));
  offset=end;
}

test('Portable wallpaper preserves exactly the selected runtime and original illustrations',()=>{
  assert.deepEqual([...payload.keys()].sort(),['README.txt','SHA256SUMS.txt','assets/fullmetal-alchemist.png','assets/ultima-online.png','index.html','wallpaper.js']);
  assert.equal(zip.length,release.offline.sizeBytes);
  assert.equal(sha(zip),release.offline.sha256);
  for(const row of release.runtimeFiles){
    assert.equal(payload.get(row.file).length,row.bytes);
    assert.equal(sha(payload.get(row.file)),row.sha256);
  }
  assert.equal(sha(payload.get('assets/fullmetal-alchemist.png')),'166f3ca4205674d0fe759d0594b4231463bafe68f078d623a4e670892261da00');
  assert.equal(sha(payload.get('assets/ultima-online.png')),'0de7e029af2bbe98e15d6d5a7f80708977d28bf48457e443c089c24a0a88faf3');
  for(const line of payload.get('SHA256SUMS.txt').toString().trim().split('\n')){
    const [digest,name]=line.split('  ');
    assert.equal(sha(payload.get(name)),digest);
  }
  const runtime=payload.get('wallpaper.js').toString();
  assert.doesNotMatch(runtime,/fetch\(|XMLHttpRequest|WebSocket|https?:\/\//);
  assert.match(runtime,/assets\/.*fullmetal-alchemist\.png/);
  assert.match(payload.get('README.txt').toString(),/Opening it installs nothing/);
});

test('Wallpaper runtime exposes a 32-second loop and responds to pause and scene controls',async()=>{
  const listeners={},documentListeners={},calls=[];
  let canvasNumber=0,frameNumber=0;
  const context=()=>new Proxy({}, {
    get(target,key){
      if(key==='createRadialGradient'||key==='createLinearGradient')return ()=>({addColorStop(){}});
      if(key==='drawImage')return ()=>calls.push('drawImage');
      return target[key]??(()=>{});
    },
    set(target,key,value){target[key]=value;return true;}
  });
  const canvas=()=>({id:++canvasNumber,width:0,height:0,getContext:context});
  const mainCanvas=canvas(),help={classList:{toggle(){calls.push('help');}}},error={};
  const document={getElementById:id=>id==='wallpaper'?mainCanvas:id==='help'?help:error,createElement:canvas,
    addEventListener:(type,callback)=>{documentListeners[type]=callback;},documentElement:{requestFullscreen:async()=>{calls.push('fullscreen');}}};
  class LocalImage{set src(value){this.url=value;this.naturalWidth=1672;this.naturalHeight=941;queueMicrotask(()=>this.onload());}}
  const window={addEventListener:(type,callback)=>{listeners[type]=callback;}};
  const sandbox={window,document,Image:LocalImage,innerWidth:1920,innerHeight:1080,devicePixelRatio:1,performance:{now:()=>1000},location:{search:'?export=1'},URLSearchParams,requestAnimationFrame:()=>++frameNumber,cancelAnimationFrame:()=>calls.push('cancel'),Math,Promise};
  vm.runInNewContext(payload.get('wallpaper.js').toString(),sandbox);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(window.wallpaperReady,true);
  assert.equal(window.wallpaperDuration,32);
  window.wallpaperRender(0);window.wallpaperRender(32);
  assert.ok(calls.filter(c=>c==='drawImage').length>=4);
  documentListeners.keydown({key:' ',preventDefault(){}});assert.ok(calls.includes('cancel'));
  documentListeners.keydown({key:'h'});assert.ok(calls.includes('help'));
  documentListeners.keydown({key:'2'});documentListeners.keydown({key:'0'});
  documentListeners.keydown({key:'f'});assert.ok(calls.includes('fullscreen'));
});

test('Wallpaper page offers both verified delivery formats and accurately labels animation',()=>{
  assert.ok(page.includes(release.video.url));
  assert.ok(page.includes('/gallery/'+release.offline.file));
  assert.equal(release.video.sha256,'3297835e11ce1c1c1dff4ca6c0af21e41dc3263a58f5c891c72b4f3a9a9fc906');
  assert.deepEqual([release.video.width,release.video.height,release.video.fps,release.video.durationSeconds,release.video.audioTracks],[1920,1080,30,32,0]);
  assert.match(page,/generated Fullmetal Alchemist and Ultima Online fan illustrations/);
  assert.match(page,/characters are illustrated stills/);
  assert.match(page,/Opening it installs nothing/);
  assert.match(page,/separate application/);
  assert.doesNotMatch(page,/<video|<script|style=/);
  for(const preview of release.previews)assert.ok(page.includes('/gallery/'+preview.file));
});

test('Wallpaper gallery card and source-selected release files match their public metadata',async()=>{
  const catalog=JSON.parse((await readFile(new URL('public/gallery/catalog.js',root),'utf8')).slice(15,-1));
  const card=catalog.items.find(i=>i.id===release.galleryId);
  assert.equal(card.project,'Alchemy-of-Britannia');
  assert.equal(card.category,'Interface');
  assert.deepEqual(card.download,release.offline);
  assert.match(card.notes,/not frame-by-frame animated characters/);
  const assets=JSON.parse(await readFile(new URL('data/release-assets/2026-10-16/manifest.json',root),'utf8'));
  for(const path of release.publicFiles){
    const file=assets.files.find(f=>f.path===path);assert.ok(file,path);
    const blob=await readFile(new URL('public/'+path,root));assert.equal(sha(blob),file.sha256);assert.equal(blob.length,file.bytes);
  }
  assert.ok(!assets.files.some(f=>f.path.endsWith('.mp4')),'Original video stays on release hosting');
});
