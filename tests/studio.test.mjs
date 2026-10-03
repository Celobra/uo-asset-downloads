import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat, readdir } from 'node:fs/promises';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../public');
const release = 'https://github.com/Celobra/uo-asset-downloads/releases/download/uo-asset-studio-v0.32.4/';
const pages = ['/studio/', '/studio/workflows/', '/studio/downloads/', '/studio/updates/'];
const localPath = pathname => resolve(root, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));

test('Studio pages have working local assets, destinations and section anchors', async () => {
  for (const page of pages) {
    const html = await readFile(localPath(page), 'utf8');
    for (const match of html.matchAll(/(?:href|src|data-gif)="([^"]+)"/g)) {
      const url = new URL(match[1].replaceAll('&amp;', '&'), 'https://studio.test' + page);
      if (url.origin !== 'https://studio.test') continue;
      const target = localPath(decodeURIComponent(url.pathname));
      assert.ok((await stat(target)).isFile(), `${page}: missing ${url.pathname}`);
      if (url.hash) {
        const targetHtml = await readFile(target, 'utf8');
        assert.ok(targetHtml.includes(`id="${decodeURIComponent(url.hash.slice(1))}"`), `${page}: missing anchor ${url.href}`);
      }
    }
    assert.doesNotMatch(html, /<script(?![^>]*src=)[^>]*>\s*\S|\son\w+=|\sstyle=/i, 'inline executable content would violate the site CSP');
    assert.doesNotMatch(html, /C:[\\/](?:Users|UO-Development|sphere)|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY/i);
  }
});

test('The installer is the primary download; application source is separate', async () => {
  for (const page of pages) {
    const html = await readFile(localPath(page), 'utf8');
    const primary = [...html.matchAll(/<a class="button primary" href="([^"]+)"/g)].map(m => m[1]);
    assert.ok(primary.length > 0);
    assert.equal(primary[0], release + 'UOAssetStudio-Setup-0.32.4.exe');
    assert.ok(primary.every(url => !url.includes('Source-')));
  }
  const downloads = await readFile(localPath('/studio/downloads/'), 'utf8');
  assert.ok(downloads.includes(release + 'UOAssetStudio-Source-0.32.4.zip'));
  assert.ok(downloads.includes(release + 'SHA256SUMS.txt'));
  assert.ok(downloads.includes('/studio/guide/UOAssetStudio-User-Guide-0.32.4.pdf'));
});

test('Studio navigation is available from the existing website sections', async () => {
  for (const page of ['/', '/gallery/', '/client/']) {
    const html = await readFile(localPath(page), 'utf8');
    assert.match(html, /href="\/studio\/"/);
  }
});

test('Public guide is complete and uses scripts/styles allowed by CSP', async () => {
  const guide = root + '/studio/guide/';
  const html = await readFile(guide + 'UOAssetStudio-User-Guide-0.32.4.html', 'utf8');
  const pdf = await readFile(guide + 'UOAssetStudio-User-Guide-0.32.4.pdf');
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.equal(createHash('sha256').update(pdf).digest('hex'), '0fe024bf831a246c88a7a12d5d114616b3d178fdeee9da7f41dde9c4234d1efd', 'PDF must match the published guide without newline conversion');
  assert.ok(pdf.length > 100000);
  assert.doesNotMatch(html, /<style\b|<script(?![^>]*src=)[^>]*>\s*\S/i);
  for (const match of html.matchAll(/(?:href|src)="(guide-[^"]+)"/g)) assert.ok((await stat(guide + match[1])).isFile());
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
  for (const match of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.has(match[1]), `missing guide section ${match[1]}`);
});

test('Studio 0.32.4 explains tile-pack selection while retaining updater behavior, export repairs and full history', async () => {
  const { releases } = JSON.parse(await readFile(resolve(root, '../data/studio-updates.json'), 'utf8'));
  assert.equal(releases[0].version, '0.32.4');
  assert.equal(releases[0].release, true);
  assert.equal(releases[0].date, '2026-10-03');
  assert.equal(releases[1].version, '0.32.3');
  assert.equal(createHash('sha256').update(JSON.stringify(releases.slice(1))).digest('hex'),
    '8b308204c697ce6a5ecdede2aa45cb1b199128ac0b209d5f8d05576fe11d2c6f',
    'All 48 earlier release records must survive this update unchanged');
  const workflow = await readFile(localPath('/studio/workflows/'), 'utf8');
  const updates = await readFile(localPath('/studio/updates/'), 'utf8');
  assert.match(workflow, /NEW IN 0\.32\.1 \/ A COMPLETE BODY EXPORT/);
  assert.match(workflow, /last valid recognized/);
  assert.match(workflow, /0x2000/);
  assert.match(workflow, /second death slot.*explicitly aliases/);
  assert.match(workflow, /Files saved\. Refreshing/);
  assert.match(workflow, /no cancellation midway/);
  assert.match(workflow, /files were already saved/);
  assert.match(updates, /id="v0-32-3"/);
  assert.match(updates, /id="v0-32-2"/);
  assert.match(workflow, /NEW IN 0\.32\.3 \/ KEEP STUDIO CURRENT/);
  assert.match(workflow, /Later/);
  assert.match(workflow, /Updates &gt; Check now/);
  assert.match(workflow, /cancelled before installation/);
  assert.match(workflow, /published size and SHA256/);
  assert.match(workflow, /remains usable offline/);
  assert.match(workflow, /UPDATED IN 0\.32\.4 \/ FOLDER AND ZIP IMPORT/);
  assert.match(workflow, /Include preview folders/);
  assert.match(workflow, /Include both PNG and BMP versions/);
  assert.match(workflow, /before reopening the folder or ZIP/);
  assert.match(workflow, /Remove selected/);
  assert.match(workflow, /without deleting files/);
  assert.match(workflow, /before allocating slots/);
  assert.match(workflow, /filename and dimensions/);
  assert.match(workflow, /original dimensions/);
  assert.match(workflow, /Choose images/);
  assert.match(updates, /id="v0-32-4"/);
  assert.match(updates, /id="v0-32-3"/);
  assert.match(updates, /id="v0-32-1"/);
});

test('Media stays within static hosting limits and animated files have GIF headers', async () => {
  const folder = root + '/studio/media/';
  const names = await readdir(folder);
  assert.ok(names.filter(n => n.endsWith('.gif')).length >= 4);
  for (const name of names) {
    assert.ok((await stat(folder + name)).size < 25 * 1024 * 1024, name);
    if (extname(name) === '.gif') assert.match((await readFile(folder + name)).subarray(0, 6).toString(), /^GIF8[79]a$/);
  }
});
