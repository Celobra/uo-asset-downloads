import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../public');
const page = await readFile(resolve(root,'client/index.html'),'utf8');
test('Client download is Standard and all release assets use Update 3', () => {
  const downloads = [...page.matchAll(/href="(https:\/\/github.com\/Celobra\/uo-asset-downloads\/releases\/download\/[^\"]+)"/g)].map(m=>m[1]);
  assert.equal(downloads.length,4);
  assert.ok(downloads.every(url=>url.includes('/classicuo-update3-20260926/')));
  assert.ok(downloads.some(url=>url.endsWith('ClassicUO-Standard-Update3-Windows-x64.zip')));
  assert.ok(downloads.some(url=>url.endsWith('ClassicUO-Sphere-Server-Scripts.zip')));
  assert.ok(downloads.every(url=>!url.includes('Invicta')));
  assert.match(page,/PDF · 32 pages/);
});
test('Client screenshots, local links, anchors and CSP-compatible resources exist', async () => {
  let screenshots = 0;
  for (const m of page.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const url = new URL(m[1], 'https://test.local/client/');
    if (url.origin !== 'https://test.local') continue;
    const path = resolve(root, '.'+url.pathname+(url.pathname.endsWith('/')?'index.html':''));
    assert.ok((await stat(path)).isFile(),path);
    if(url.hash) assert.ok((await readFile(path,'utf8')).includes(`id="${url.hash.slice(1)}"`));
    if(url.pathname.includes('/client/media/') && m[0].startsWith('src')) screenshots++;
  }
  assert.equal(screenshots,8);
  assert.doesNotMatch(page,/<script(?![^>]*src=)[^>]*>\s*\S|\son\w+=|\sstyle=/i);
  assert.doesNotMatch(page,/C:[\\/](?:Users|UO-Development|sphere)/i);
});
