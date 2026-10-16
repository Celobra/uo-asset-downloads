import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePublishedAssistantFeed } from '../tools/assistant-updates.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const metadata=JSON.parse(await readFile(resolve(root,'data/assistant-release.json'),'utf8'));
const page=await readFile(resolve(root,'public/assistant/index.html'),'utf8');
test('Assistant downloads identify the exact reviewed preview and preserve signing and testing limits',async()=>{
 assert.equal(metadata.version,'0.3.0');
 assert.equal(metadata.clientVersion,'0.3.0');
 const installer=metadata.artifacts['UOAssistant-0.3.0-Setup.exe'];
 assert.ok(installer.bytes>100_000_000);assert.match(installer.sha256,/^[a-f0-9]{64}$/i);
 assert.ok(page.includes(installer.sha256.toLowerCase()));assert.ok(page.includes(installer.bytes.toLocaleString('en-GB')));
 assert.equal(metadata.privateProfilesIncluded,false);assert.equal(metadata.gameDataIncluded,false);assert.equal(metadata.automaticLogin,false);
 for(const url of Object.values(metadata.downloads).flat()) assert.ok(url.startsWith('https://github.com/Celobra/uo-asset-downloads/releases/download/uo-assistant-v0.3.0/')||url.startsWith('https://www.uoassets.com/assistant/'));
 for(const text of ['Unsigned development preview','not a server acknowledgement','synthetic test','not live walking','signing','32 of 200 scripts fully','LGPL version 3','NVIDIA hardware was tested']){
  if(text==='signing')assert.match(metadata.status,/unsigned/);else assert.ok(page.includes(text),text);
 }
 for(const name of ['integrated','launcherCoreNetwork','launcherInterface','installation','payloadFiles'])assert.ok(Number.isSafeInteger(metadata.producerChecks[name])&&metadata.producerChecks[name]>0,name);
 assert.deepEqual(metadata.automaticUpdates,{feed:'https://www.uoassets.com/assistant/update.json',defaultCheckOnLaunch:true,intervalMinutesWhileIdle:30,automaticInstallation:false,signedCatalog:true,existingPreferencesRetained:true});
 for(const version of ['0.2.1','0.1.6']){
  assert.ok(metadata.previousReleases.some(release=>release.version===version));
  for(const file of ['Setup.exe','Source.zip','Guide.zip'])assert.ok(page.includes(`uo-assistant-v${version}/UOAssistant-${version}-`+file));
 }
 assert.ok(metadata.downloads.recordingTools&&metadata.downloads.ffmpegSource&&metadata.downloads.ffmpegDependencies.length===2&&metadata.downloads.recordingNotices);
 await validatePublishedAssistantFeed(root);
});
test('Assistant page, guides and notices have complete local links under the hosting stylesheet policy',async()=>{
 const directory=resolve(root,'public/assistant');
 const htmls=['index.html',...(await readdir(resolve(directory,'guide'))).filter(n=>n.endsWith('.html')).map(n=>'guide/'+n)];
 for(const name of htmls){
  const html=await readFile(resolve(directory,name),'utf8');
  assert.doesNotMatch(html,/<style\b|\sstyle=|<script\b/i,name);
  assert.doesNotMatch(html,/Regisfall|C:[/\\]Users|G:[/\\]My Drive|Documents[/\\]ChatGPT/i,name);
  for(const match of html.matchAll(/(?:href|src)="([^"]+)"/g)){
   const url=new URL(match[1].replaceAll('&amp;','&'),'https://test.invalid/assistant/'+name);
   if(url.origin!=='https://test.invalid')continue;
   const path=resolve(root,'public','.'+decodeURIComponent(url.pathname)+(url.pathname.endsWith('/')?'index.html':''));
   assert.ok((await stat(path)).isFile(),`${name}: ${url.pathname}`);
   if(url.hash){const target=await readFile(path,'utf8');assert.ok(target.includes(`id="${decodeURIComponent(url.hash.slice(1))}"`),url.href);}
  }
 }
});
test('Both gallery entry points expose the application while retaining current Studio and creature notices',async()=>{
 for(const name of ['public/index.html','public/gallery/index.html']){
  const html=await readFile(resolve(root,name),'utf8');
  for(const text of ['/assistant/','UO Assistant 0.3.0','Studio 0.33.12','Orc-NPC-Roles','CentrED#'])assert.ok(html.includes(text),name+': '+text);
 }
});
