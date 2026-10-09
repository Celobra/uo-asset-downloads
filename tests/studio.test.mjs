import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat, readdir } from 'node:fs/promises';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../public');
const release = 'https://github.com/Celobra/uo-asset-downloads/releases/download/uo-asset-studio-v0.33.8/';
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
    assert.equal(primary[0], release + 'UOAssetStudio-Setup-0.33.8.exe');
    assert.ok(primary.every(url => !url.includes('Source-')));
  }
  const downloads = await readFile(localPath('/studio/downloads/'), 'utf8');
  assert.ok(downloads.includes(release + 'UOAssetStudio-Source-0.33.8.zip'));
  assert.ok(downloads.includes(release + 'SHA256SUMS-0.33.8.txt'));
  assert.ok(downloads.includes('/studio/guide/UOAssetStudio-User-Guide-0.33.8.pdf'));
});

test('Studio navigation is available from the existing website sections', async () => {
  for (const page of ['/', '/gallery/', '/client/']) {
    const html = await readFile(localPath(page), 'utf8');
    assert.match(html, /href="\/studio\/"/);
  }
});

test('Public guide is complete and uses scripts/styles allowed by CSP', async () => {
  const guide = root + '/studio/guide/';
  const html = await readFile(guide + 'UOAssetStudio-User-Guide-0.33.8.html', 'utf8');
  const pdf = await readFile(guide + 'UOAssetStudio-User-Guide-0.33.8.pdf');
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.equal(createHash('sha256').update(pdf).digest('hex'), '41512076bd6fd5b00bdbe7d88e19a3386d38dddc88c8b300b4efb9b94abf929c', 'PDF must match the published guide without newline conversion');
  assert.ok(pdf.length > 100000);
  assert.doesNotMatch(html, /<style\b|<script(?![^>]*src=)[^>]*>\s*\S/i);
  for (const match of html.matchAll(/(?:href|src)="(guide-[^"]+)"/g)) assert.ok((await stat(guide + match[1])).isFile());
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
  for (const match of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.has(match[1]), `missing guide section ${match[1]}`);
});

test('Studio 0.33.8 retains direct imports, safeguards and full history', async () => {
  const { releases } = JSON.parse(await readFile(resolve(root, '../data/studio-updates.json'), 'utf8'));
  assert.equal(releases[0].version, '0.33.8');
  assert.equal(releases[0].release, true);
  assert.equal(releases[0].date, '2026-10-09');
  assert.equal(releases[1].version, '0.33.7');
  assert.equal(createHash('sha256').update(JSON.stringify(releases.slice(1))).digest('hex'),
    'f31cdd43191a97b09b28bffba65587443d00938be97b7e596b85ae107152eacf',
    'All 58 earlier release records must survive this update unchanged');
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
  assert.match(workflow, /UPDATED IN 0\.33\.8 \/ FOLDER AND ZIP IMPORT/);
  assert.match(workflow, /Include preview images/);
  assert.match(workflow, /Include both PNG and BMP versions/);
  assert.match(workflow, /before reopening the folder or ZIP/);
  assert.match(workflow, /Remove selected/);
  assert.match(workflow, /without deleting files/);
  assert.match(workflow, /before allocating slots/);
  assert.match(workflow, /filename and dimensions/);
  assert.match(workflow, /original dimensions/);
  assert.match(workflow, /Choose images/);
  assert.match(updates, /id="v0-32-4"/);
  assert.match(updates, /id="v0-32-5"/);
  assert.match(workflow, /NEW IN 0\.32\.5 \/ START WITH YOUR ARTWORK/);
  assert.match(workflow, /35 tools/);
  assert.match(workflow, /Import Tiles/);
  assert.match(workflow, /Import Statics/);
  assert.match(workflow, /Import Gumps/);
  assert.match(workflow, /Import Animation/);
  assert.match(workflow, /Import Mounts/);
  assert.ok(workflow.includes("Import artwork"));
  assert.ok(workflow.includes("Browse &amp; preview"));
  assert.ok(workflow.includes("Server scripts"));
  assert.ok(workflow.includes("Build worlds"));
  assert.ok(workflow.includes("Files &amp; distribution"));
  assert.match(workflow, /Simple and Advanced/);
  assert.match(workflow, /native map terrain remains a separate format/);
  assert.match(workflow, /Standalone animation-to-VD conversion/);
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


test('Practical workspace instructions identify their controls and preserve local-test limits', async () => {
  const html = await readFile(localPath('/studio/workflows/'), 'utf8');
  for (const text of ['Test / Interact', 'Review edited image', 'Save selected', 'Place stamp', 'Keep small generation pictures', 'View generation stages', 'Tool readiness', 'File details', 'All pieces']) assert.ok(html.includes(text), text);
  assert.match(html, /does not run Sphere handlers/);
  assert.match(html, /Matching artwork must be shared separately/);
  assert.match(html, /does not guarantee that every contained image/);
  assert.match(html, /same asset ID/);
  const downloads = await readFile(localPath('/studio/downloads/'), 'utf8');
  assert.match(downloads, /91 pages.<br>33 practical chapters/);
  const { releases } = JSON.parse(await readFile(resolve(root, '../data/studio-updates.json'), 'utf8'));
  assert.equal(releases.length, 59);
});


test('Animated artwork routes identify native distribution and review steps', async () => {
  const html = await readFile(localPath('/studio/workflows/'), 'utf8');
  for (const text of ['Animated items','Spell / visual effects','Body / character animations','Mounts / rideable objects','AnimData','Queue changes','Export pending bundle','before saving or clearing','ZIP container','.uoasset']) assert.ok(html.includes(text),text);
  assert.ok(html.includes('does not automatically add spell damage'));
  assert.ok(html.includes('C# scripts are shared separately'));
});


test('Website armor folder instructions identify complete sources and explicit review', async () => {
  const html = await readFile(localPath('/studio/workflows/'), 'utf8');
  for (const text of ['id="armor-folder-import"', 'Open set / collection folder', 'outer extracted folder', 'piece subfolders', 'manifest.json', 'Add whole set', 'Review complete set', 'male/female paperdolls', 'fresh destinations', 'does not write game files', 'whole-suit VD cannot be split']) assert.ok(html.includes(text), text);
  const downloads = await readFile(localPath('/studio/downloads/'), 'utf8');
  assert.ok(downloads.includes('several piece folders'));
  const { releases } = JSON.parse(await readFile(resolve(root, '../data/studio-updates.json'), 'utf8'));
  assert.ok(releases.find(r=>r.version==='0.33.3').added.some(text => text.includes('Open ZIP')));
});


test('Direct ZIP workflows explain source selection, metadata and normal reviewed saves', async () => {
  const html = await readFile(localPath('/studio/workflows/'), 'utf8');
  for (const text of ['id="zip-package-import"', 'Complete armor set → Open ZIP', 'Open piece ZIP', 'Open sequence ZIP', 'Convert body ZIP to .vd', 'Reimport body ZIP', 'Choose image from ZIP', 'does not combine unrelated groups', 'frames.json', 'body.json', 'without saving client or server files', 'mounted poses']) assert.ok(html.includes(text), text);
  const downloads = await readFile(localPath('/studio/downloads/'), 'utf8');
  assert.ok(downloads.includes('select the archive directly'));
});


test('Armor script layout explains defaults, destinations and independent pieces', async () => {
  const html = await readFile(localPath('/studio/workflows/'), 'utf8');
  for (const text of ['id="armor-script-layout"','One file per piece','One file for whole set','shared script folder and filename','Review complete set','Queue changes','existing destination','required generated helpers','resource registration','separate <code>.cs</code> files','does not turn the set into a single wearable item']) assert.ok(html.includes(text),text);
  const downloads = await readFile(localPath('/studio/downloads/'), 'utf8');
  assert.ok(downloads.includes('Can an armor set use one Sphere script file?'));
  const { releases } = JSON.parse(await readFile(resolve(root,'../data/studio-updates.json'),'utf8'));
  assert.ok(releases.find(r=>r.version==='0.33.4').added.some(text => text.includes('One file for whole set')));
});


test('Script destinations explain existing Sphere files, staged folders and distribution limits', async () => {
  const workflow = await readFile(localPath('/studio/workflows/'), 'utf8');
  for (const text of ['id="script-destinations"','New script','Add to existing script','Existing script','New script filename','New folder','original definitions and comments','complete resulting','one final EOF','Multiple queued appends','session restoration','exact original-file recovery','new separate <code>.cs</code> files','Content packs reject existing-script appends','One file for whole set']) assert.ok(workflow.includes(text),text);
  const downloads = await readFile(localPath('/studio/downloads/'), 'utf8');
  assert.ok(downloads.includes('Can I add new definitions to an existing Sphere script?'));
  const { releases } = JSON.parse(await readFile(resolve(root,'../data/studio-updates.json'),'utf8'));
  assert.ok(releases.find(r=>r.version==='0.33.5').added.some(text => text.includes('Add to existing script')));
  assert.ok(releases.find(r=>r.version==='0.33.5').added.some(text => text.includes('New folder')));
});


test('Recent activity explains completed local history, navigation and the latest 100 actions', async () => {
  const html = await readFile(localPath('/studio/workflows/'), 'utf8');
  for (const text of ['id="recent-activity"','Recent activity','Simple or Advanced','100','Search','Refresh','Open affected folder','affected files','survives restarting','only queued','does not upload your activity','save and recovery']) assert.ok(html.includes(text), text);
  const { releases } = JSON.parse(await readFile(resolve(root,'../data/studio-updates.json'),'utf8'));
  assert.ok(releases.find(r=>r.version==='0.33.6').added.some(text => text.includes('Recent activity') && text.includes('100')));
});

test('Rules 4 world workflow identifies exact controls, dependencies and receiving-game limits', async () => {
  const html = await readFile(localPath('/studio/workflows/'), 'utf8');
  for (const text of ['id="world-generator-0336"','Temperate Mainland','Island Adventures','Frozen Highlands','Dry Frontier','Volcanic Wilderness','Keep this world','Another world','Restore kept','Compare worlds','World setups ▾','Open setup…','Save setup…','Save favourite…','Favourites / recent…','Reroll chosen part','Apply regions','Buildings from your stamps','Add stamp…','Generation stages…','Keep generation pictures','Check details','Terrain review','TileData','bounded one-level approximation','maintained legacy rules','do not create NPCs','receiving client and shard']) assert.ok(html.includes(text), text);
  const downloads = await readFile(localPath('/studio/downloads/'), 'utf8');
  assert.ok(downloads.includes('1,297 final application checks passed with zero skips'));
  const overview = await readFile(localPath('/studio/'), 'utf8');
  assert.ok(overview.includes('35 tools'));
  assert.ok(overview.includes('id="worlds-and-activity"'));
});


test('Static ZIP workflow explains named skips, exact variant choices and separate sequence limits', async () => {
  const page = await readFile(localPath('/studio/workflows/'), 'utf8');
  const html = page.match(/<section class="wrap workflow" id="static-tiles">[\s\S]*?<\/section>/)[0];
  for (const text of ['Open ZIP','Include subfolders','View skipped files...','filenames and reasons','previous selection remains','Include preview images','Include both PNG and BMP versions','before reopening the folder or ZIP','does not replace the loaded list','does not resize images or split sheets','4096 compatible still tiles','16 million total pixels','128 MB','16 MB per image file','256-file cap','64 frames','exact mirrored','png/walls/tile1.png','bmp/walls/tile1.bmp','exactly one matching-format directory','without silently falling back','An incompatible selected frame stops','Frames named with preview or contact-sheet tokens remain selected','reopen it with animation enabled','Resource limits, cancellation','Review files and script','not inferred from a preview or manifest']) assert.ok(html.includes(text),text);
  const { releases } = JSON.parse(await readFile(resolve(root,'../data/studio-updates.json'),'utf8'));
  assert.ok(releases[0].added.some(text => text.includes('View skipped files')));
  assert.ok(releases[0].fixed.some(text => text.includes('64 frames')));
  const overview = await readFile(localPath('/studio/'),'utf8');
  assert.ok(overview.includes('id="static-pack-imports"'));
});

test('Region navigation remains available with canvas focus and explicit current-facet selection', async () => {
  const page = await readFile(localPath('/studio/workflows/'), 'utf8');
  const html = page.match(/<section class="wrap workflow" id="region-navigation">[\s\S]*?<\/section>/)[0];
  for (const text of ['NEW IN 0.33.7','Pan map','left button','Middle- or right-drag','every mode','focused canvas','Shift','Wheel zoom','Home and Fit map','Choose the facet in Map first','double-click / Enter','Fit boundary','Escape','reviewed save, queue, backup and recovery']) assert.ok(html.includes(text),text);
  const { releases } = JSON.parse(await readFile(resolve(root,'../data/studio-updates.json'),'utf8'));
  assert.equal(releases[1].version,'0.33.7');
  assert.ok(releases[0].improved.some(text=>text.includes('Map Regions')&&text.includes('0.33.7')));
});
