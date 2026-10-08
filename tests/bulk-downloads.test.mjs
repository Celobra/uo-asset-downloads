import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import vm from 'node:vm';

const root = new URL('../public/', import.meta.url);
const context = { window: { crypto: webcrypto }, URL, URLSearchParams, Blob, AbortController, DOMException, Uint8Array, setTimeout, clearTimeout };
for (const file of ['gallery/catalog.js', 'gallery/browse-model.js', 'gallery/bulk-downloads.js']) vm.runInNewContext(readFileSync(new URL(file, root), 'utf8'), context);
const bulk = context.window.GALLERY_BULK_DOWNLOADS;
const nav = context.window.GALLERY_NAV;
const model = nav.create(context.window.GALLERY.items);
const baseURI = 'https://www.uoassets.com/gallery/';
const bytes = new Uint8Array([0x50, 0x4b, 3, 4, 100, 200, 255, 0]);
const sha256 = createHash('sha256').update(bytes).digest('hex');
const asset = (id, file = 'downloads/equipment/example.zip') => ({ id, name: `Asset ${id}`, download: { file, sizeBytes: bytes.length, sha256 } });

test('Bulk plans include only current filtered pages and deduplicate shared native packages', () => {
  let largest = 0, shared = 0;
  for (const category of nav.categories) {
    for (const sort of ['az', 'za']) {
      const state = model.normalize({ category: category.id, all: true, sort });
      const pages = model.listing(state).pages;
      for (let page = 1; page <= pages; page++) {
        const listing = model.listing({ ...state, page });
        const downloadPlan = bulk.plan(listing.items, baseURI);
        assert.equal(downloadPlan.assets, listing.items.length);
        assert.ok(downloadPlan.assets > 0 && downloadPlan.assets <= 24);
        assert.equal(downloadPlan.packages.length, new Set(listing.items.map(item => item.download.file)).size);
        assert.equal(downloadPlan.totalBytes, downloadPlan.packages.reduce((sum, item) => sum + item.sizeBytes, 0));
        largest = Math.max(largest, downloadPlan.totalBytes);
        if (downloadPlan.packages.length < downloadPlan.assets) shared++;
      }
    }
  }
  assert.ok(shared > 0, 'Real collection packages are shared by several displayed assets');
  assert.ok(largest > 100 * 1024 * 1024, 'Existing pages over 100 MiB can still be downloaded');
  assert.throws(() => bulk.plan([], baseURI), /Choose between/);
  assert.throws(() => bulk.plan(Array.from({ length: 25 }, (_, index) => asset(index)), baseURI), /Choose between/);
});

test('Both gallery entry points resolve package URLs through the gallery base and keep category folders', () => {
  const items = [asset('a'), asset('b', 'downloads/creatures/example.zip')];
  for (const path of ['index.html', 'gallery/index.html']) {
    const html = readFileSync(new URL(path, root), 'utf8');
    const documentBase = path === 'index.html' ? new URL('./gallery/', 'https://www.uoassets.com/').href : baseURI;
    const downloadPlan = bulk.plan(items, documentBase);
    assert.deepEqual(Array.from(downloadPlan.packages, item => item.name), ['equipment/example.zip', 'creatures/example.zip']);
    assert.ok(downloadPlan.packages.every(item => item.url.startsWith('https://www.uoassets.com/gallery/downloads/')));
    for (const id of ['bulk-downloads', 'select-page', 'selected-count', 'download-selected', 'download-page', 'clear-selection', 'cancel-download', 'bulk-download-status']) assert.ok(html.includes(`id="${id}"`), `${path}: ${id}`);
    assert.ok(html.indexOf('src="browse-model.js"') < html.indexOf('src="download-archive.js"'));
    assert.ok(html.indexOf('src="download-archive.js"') < html.indexOf('src="bulk-downloads.js"'));
    assert.ok(html.indexOf('src="bulk-downloads.js"') < html.indexOf('src="browse.js"'));
  }
});

test('Plans reject unexpected origins, paths and inconsistent native package metadata', () => {
  for (const file of ['https://other.example/gallery/downloads/equipment/example.zip', '/gallery/catalog.js', 'downloads/equipment/example.zip?token=x', 'downloads/equipment/example.zip#x', 'downloads/equipment/%5Cexample.zip']) assert.throws(() => bulk.plan([asset('a', file)], baseURI), /not available|invalid filename/);
  assert.throws(() => bulk.plan([{ id: 'a', name: 'Missing download' }], baseURI), /No game-file package/);
  const inconsistent = asset('b'); inconsistent.download.sha256 = '0'.repeat(64);
  assert.throws(() => bulk.plan([asset('a'), inconsistent], baseURI), /inconsistent/);
});

test('Shared packages are fetched once with original bytes and verified SHA-256', async () => {
  const downloadPlan = bulk.plan([asset('a'), asset('b')], baseURI);
  const calls = [], progress = [];
  const entries = await bulk.fetchPackages(downloadPlan, { fetcher: async (url, options) => {
    calls.push({ url, credentials: options.credentials });
    return { ok: true, blob: async () => new Blob([bytes]) };
  }, onProgress: event => progress.push(event.completed) });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].credentials, 'same-origin');
  assert.equal(entries.length, 1);
  assert.equal(entries[0].name, 'equipment/example.zip');
  assert.deepEqual(new Uint8Array(await entries[0].blob.arrayBuffer()), bytes);
  assert.deepEqual(progress, [0, 1]);
});

test('Failed, truncated or corrupt packages fail the whole bulk download', async () => {
  const downloadPlan = bulk.plan([asset('a')], baseURI);
  for (const response of [
    { ok: false },
    { ok: true, blob: async () => new Blob([bytes.slice(1)]) },
    { ok: true, blob: async () => new Blob([new Uint8Array(bytes.length)]) }
  ]) await assert.rejects(bulk.fetchPackages(downloadPlan, { fetcher: async () => response }), /Could not download Asset a/);
});

test('Cancellation prevents requests or stops an active request and permits retry', async () => {
  const downloadPlan = bulk.plan([asset('a')], baseURI);
  const preAborted = new AbortController(); preAborted.abort();
  let requests = 0;
  await assert.rejects(bulk.fetchPackages(downloadPlan, { signal: preAborted.signal, fetcher: async () => { requests++; } }), error => error.name === 'AbortError');
  assert.equal(requests, 0);
  const active = new AbortController();
  await assert.rejects(bulk.fetchPackages(downloadPlan, { signal: active.signal, fetcher: (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    active.abort();
  }) }), error => error.name === 'AbortError');
  const entries = await bulk.fetchPackages(downloadPlan, { fetcher: async () => ({ ok: true, blob: async () => new Blob([bytes]) }) });
  assert.equal(entries.length, 1);
});

test('A stalled request times out and restores a retryable error', async () => {
  const downloadPlan = bulk.plan([asset('a')], baseURI);
  await assert.rejects(bulk.fetchPackages(downloadPlan, { timeoutMs: 5, fetcher: (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }) }), /Could not download Asset a/);
});
