import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const metadata=JSON.parse(await readFile(resolve(root,'data/assistant-release.json'),'utf8'));
const page=await readFile(resolve(root,'public/assistant/index.html'),'utf8');
test('Assistant downloads identify the exact reviewed preview and preserve signing and testing limits',()=>{
 assert.equal(metadata.version,'0.2.1');
 assert.equal(metadata.clientVersion,'0.2.0');
 assert.equal(metadata.artifacts['UOAssistant-0.2.1-Setup.exe'].bytes,118645053);
 assert.equal(metadata.artifacts['UOAssistant-0.2.1-Setup.exe'].sha256.toLowerCase(),'4d68f017035288b7f47a253415cc9d9850b48a91c044e31c75d834eccd32461e');
 assert.equal(metadata.privateProfilesIncluded,false);assert.equal(metadata.gameDataIncluded,false);assert.equal(metadata.automaticLogin,false);
 for(const url of Object.values(metadata.downloads)) assert.ok(url.startsWith('https://github.com/Celobra/uo-asset-downloads/releases/download/uo-assistant-v0.2.1/'));
 for(const text of ['Unsigned development preview','not a server acknowledgement','synthetic test','not a live performance benchmark','signing','852']){
  if(text==='signing')assert.match(metadata.status,/unsigned/);else assert.ok(page.includes(text),text);
 }
 assert.equal(metadata.producerChecks.integrated,852);assert.equal(metadata.producerChecks.launcherCoreNetwork,111);assert.equal(metadata.producerChecks.launcherInterface,14);
 assert.equal(metadata.producerChecks.installation,1118);assert.equal(metadata.producerChecks.gameFilesReusedExactly,634);
 assert.deepEqual(metadata.automaticUpdates,{feed:'https://www.uoassets.com/assistant/update.json',defaultCheckOnLaunch:true,intervalMinutesWhileIdle:30,automaticInstallation:false,signedCatalog:true,existingPreferencesRetained:true});
 assert.equal(metadata.previousReleases[0].version,'0.1.6');
 for(const file of ['Setup.exe','Source.zip','Guide.zip'])assert.ok(page.includes('uo-assistant-v0.1.6/UOAssistant-0.1.6-'+file));
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
  for(const text of ['/assistant/','UO Assistant 0.2.1','Studio 0.33.12','Orc-NPC-Roles','CentrED#'])assert.ok(html.includes(text),name+': '+text);
 }
});
