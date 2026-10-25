import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePublishedAssistantFeed } from '../tools/assistant-updates.mjs';
import { normalizeSdkFile } from '../tools/sync-assistant-sdk.mjs';
import { createHash } from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const metadata=JSON.parse(await readFile(resolve(root,'data/assistant-release.json'),'utf8'));
const page=await readFile(resolve(root,'public/assistant/index.html'),'utf8');
test('Assistant downloads identify the exact reviewed preview and preserve signing and testing limits',async()=>{
 assert.equal(metadata.version,'0.7.1');
 assert.equal(metadata.clientVersion,'0.7.1');
 const installer=metadata.artifacts['UOAssistant-0.7.1-Setup.exe'];
 assert.ok(installer.bytes>100_000_000);assert.match(installer.sha256,/^[a-f0-9]{64}$/i);
 assert.ok(page.includes(installer.sha256.toLowerCase()));assert.ok(page.includes(installer.bytes.toLocaleString('en-GB')));
 assert.equal(metadata.privateProfilesIncluded,false);assert.equal(metadata.gameDataIncluded,false);assert.equal(metadata.automaticLogin,false);
 for(const key of ['installer','source','guide','rebuildKit','checksums']) assert.ok(metadata.downloads[key].startsWith('https://github.com/Celobra/uo-asset-downloads/releases/download/uo-assistant-v0.7.1/'));
 for(const url of [metadata.downloads.recordingTools,metadata.downloads.ffmpegSource,...metadata.downloads.ffmpegDependencies])assert.ok(url.startsWith('https://github.com/Celobra/uo-asset-downloads/releases/download/uo-assistant-v0.3.0/'));
 assert.ok(metadata.producerChecks.installation>=36);assert.ok(page.includes(metadata.producerChecks.installation.toLocaleString('en-GB')+' installation, preservation and removal checks'));assert.ok(metadata.producerChecks.integrated>1307);assert.ok(metadata.producerChecks.companionInterface>=563);assert.equal(metadata.guide.companionTools,58);assert.equal(metadata.upgradeBehavior.stopOnUninstallFailure,true);
 for(const method of ['scanTiles','findItems','findGumps'])assert.ok(page.includes(method));
 for(const text of ['Unsigned development preview','not a server acknowledgement','synthetic test','not live walking','signing','32 of 200 scripts fully','LGPL version 3','NVIDIA hardware was tested']){
  if(text==='signing')assert.match(metadata.status,/unsigned/);else assert.ok(page.includes(text),text);
 }
 for(const name of ['installation','launcherCoreNetwork','launcherInterface','payloadFiles'])assert.ok(Number.isSafeInteger(metadata.producerChecks[name])&&metadata.producerChecks[name]>0,name);
 assert.deepEqual(metadata.automaticUpdates,{feed:'https://www.uoassets.com/assistant/update.json',defaultCheckOnLaunch:true,intervalMinutesWhileIdle:30,automaticInstallation:false,signedCatalog:true,existingPreferencesRetained:true});
 for(const version of ['0.7.0','0.6.1','0.6.0','0.5.0','0.4.0','0.3.0','0.2.1','0.1.6']){
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
 const studio=JSON.parse(await readFile(resolve(root,'data/studio-release.json'),'utf8'));
 for(const name of ['public/index.html','public/gallery/index.html']){
  const html=await readFile(resolve(root,name),'utf8');
  for(const text of ['/assistant/','UO Assistant 0.7.1',`Studio ${studio.version}`,'Orc-NPC-Roles','CentrED#'])assert.ok(html.includes(text),name+': '+text);
 }
});

test('Published SDK matches the final payload contract and documents all 48 current API methods',async()=>{
 const manifest=JSON.parse(await readFile(resolve(root,'data/assistant-sdk-release.json'),'utf8'));
 assert.equal(manifest.schema,1);assert.equal(manifest.version,metadata.version);
 assert.equal(manifest.installerSha256,metadata.artifacts[`UOAssistant-${metadata.version}-Setup.exe`].sha256.toLowerCase());
 assert.equal(manifest.sourceSha256,metadata.artifacts[`UOAssistant-${metadata.version}-Source.zip`].sha256.toLowerCase());
 const sdk=resolve(root,'public/assistant/SDK');
 const actual=[];
 async function inventory(directory,prefix=''){
  for(const entry of await readdir(directory,{withFileTypes:true})){
   assert.ok(!entry.isSymbolicLink(),'SDK files must not be redirected');
   if(entry.isDirectory())await inventory(resolve(directory,entry.name),prefix+entry.name+'/');
   else if(entry.isFile())actual.push(prefix+entry.name);
  }
 }
 await inventory(sdk);
 assert.deepEqual(actual.sort(),manifest.files.map(file=>file.path).sort(),'SDK must have the entire final payload tree and no stale extra files');
 for(const file of manifest.files){
  assert.ok(!file.path.split('/').includes('..')&&!file.path.startsWith('/'));
  const bytes=normalizeSdkFile(file.path,await readFile(resolve(sdk,file.path)));
  assert.equal(bytes.length,file.bytes,file.path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256,file.path);
 }
 const definitions=await readFile(resolve(sdk,'assistant.d.ts'),'utf8');
 const api=definitions.match(/interface AssistantApi \{([\s\S]*?)\n\}/)?.[1];assert.ok(api);
 const methods=[...api.matchAll(/^\s{2}(\w+)\(/gm)].map(match=>match[1]);
 assert.equal(methods.length,48);assert.equal(new Set(methods).size,48);
 assert.equal(metadata.guide.apiMethods,methods.length);
 for(const method of ['equipItem','scanTiles','findItems','findGumps'])assert.ok(methods.includes(method));
 for(const field of ['Playability: AssistantPlayability','interface AssistantPlayability','Layout: {Width: number','ActivePage: number','PageChoices: {Id: number'])assert.ok(definitions.includes(field),field);
 const loot=definitions.match(/interface AssistantLootRules \{([\s\S]*?)\n\}/)?.[1];
 assert.match(loot,/Name\?: string; Destination\?: number/);
 assert.match(api,/waitForJournal\([^\n]+source\?: "All" \| "System"/);
 const examples=JSON.parse(await readFile(resolve(sdk,'examples/examples.json'),'utf8'));
 assert.equal(examples.Version,metadata.version);assert.equal(examples.Examples.length,15);
 assert.equal(metadata.guide.standaloneExamples,examples.Examples.length);
 const simple=JSON.parse(await readFile(resolve(sdk,'simple-examples/catalog.json'),'utf8'));
 assert.equal(simple.Commands.length,43); assert.equal(simple.Examples.length,15);
 assert.equal(metadata.simpleScripts.commands,simple.Commands.length); assert.equal(metadata.simpleScripts.examples,simple.Examples.length);
 const files=manifest.files.filter(f=>f.path.endsWith('.uosimple'));
 assert.equal(files.length,15);
 for(const file of files){const text=normalizeSdkFile(file.path,await readFile(resolve(sdk,file.path))).toString('utf8');assert.match(text,/^# UO Assistant run limit: (60|300|1800) seconds\n/);assert.doesNotMatch(text,/await assistant\./);}
 assert.equal(manifest.files.length,examples.Examples.length+3+simple.Examples.length+2);
 for(const text of ['Simple Scripts','player.cast','items.move','trees.chop','guide/Simple-Scripts.html','guide/Simple-Scripts.pdf'])assert.ok(page.includes(text),text);
});
