import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = resolve(root, 'public');
const data = JSON.parse(await readFile(resolve(root, 'data/uopve.json'), 'utf8'));
const routes = ['/uopve/', '/uopve/introduction/', '/uopve/wiki/', '/uopve/downloads/', '/uopve/updates/',
  ...data.articles.map(article => `/uopve/wiki/${article.slug}/`)];
const localPath = pathname => resolve(publicRoot, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
const htmlFor = route => readFile(localPath(route), 'utf8');
const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const decodeHtml = value => value.replace(/&(amp|lt|gt|quot|#39);/g, (_, entity) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[entity]);

test('Every UO:PvE page has a unique canonical, accessible headings and working local links, assets and fragments', async () => {
  for (const route of routes) {
    const html = await htmlFor(route);
    assert.match(html, /<html lang="en">/);
    assert.match(html, /name="viewport" content="width=device-width,initial-scale=1"/);
    assert.equal([...html.matchAll(/<h1\b/g)].length, 1, route);
    assert.ok(html.includes(`<link rel="canonical" href="https://www.uoassets.com${route}">`), route);
    assert.ok(html.includes(`<meta property="og:url" content="https://www.uoassets.com${route}">`), route);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length, `${route}: duplicate element ID`);
    assert.ok(ids.includes('main'), route);
    for (const match of html.matchAll(/aria-labelledby="([^"]+)"/g)) {
      for (const id of match[1].split(/\s+/)) assert.ok(ids.includes(id), `${route}: inaccessible label ${id}`);
    }
    for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const url = new URL(decodeHtml(match[1]), `https://www.uoassets.com${route}`);
      assert.equal(url.protocol, 'https:', `${route}: unsafe protocol ${url.href}`);
      assert.equal(url.username + url.password, '', `${route}: embedded URL credentials`);
      if (url.origin !== 'https://www.uoassets.com') continue;
      const target = localPath(decodeURIComponent(url.pathname));
      assert.ok((await stat(target)).isFile(), `${route}: missing ${url.pathname}`);
      if (url.hash) {
        const targetHtml = await readFile(target, 'utf8');
        assert.ok(targetHtml.includes(`id="${decodeURIComponent(url.hash.slice(1))}"`), `${route}: missing anchor ${url.href}`);
      }
    }
    for (const match of html.matchAll(/<img\b[^>]*>/g)) {
      assert.match(match[0], /\balt="[^"]+"/, `${route}: image without description`);
      assert.match(match[0], /\bwidth="\d+"[^>]*\bheight="\d+"/, `${route}: image without intrinsic dimensions`);
    }
    assert.doesNotMatch(html, /<style\b|<script\b(?![^>]*\bsrc=)|\son\w+=|\sstyle=/i, `${route}: inline content violates CSP`);
    assert.doesNotMatch(html, /C:[\\/](?:Users|UO-Development|sphere)|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY/i, route);
  }
});

test('The player hub and existing site sections expose the introduction, wiki, downloads and updates', async () => {
  const home = await htmlFor('/uopve/');
  for (const section of ['introduction', 'wiki', 'downloads', 'updates']) assert.ok(home.includes(`href="/uopve/${section}/"`), section);
  for (const route of ['/', '/gallery/', '/client/', '/studio/', '/studio/workflows/', '/studio/downloads/', '/studio/updates/']) {
    assert.match(await htmlFor(route), /href="\/uopve\/"/, `${route}: missing UO:PvE navigation`);
  }
});

test('The wiki and updates retain every maintained article, related route and complete plain-text entry', async () => {
  const wiki = await htmlFor('/uopve/wiki/');
  const updates = await htmlFor('/uopve/updates/');
  assert.equal([...wiki.matchAll(/\bdata-wiki-entry\b/g)].length, data.articles.length);
  assert.equal([...updates.matchAll(/\bdata-update-entry\b/g)].length, data.updates.length);
  for (const html of [wiki, updates]) {
    assert.match(html, /<noscript>/);
    for (const match of html.matchAll(/<article\b[^>]*\bdata-(?:wiki|update)-entry\b[^>]*>/g)) {
      assert.doesNotMatch(match[0], /\bhidden\b/, 'Entries must remain visible without JavaScript');
    }
  }
  for (const article of data.articles) {
    const html = await htmlFor(`/uopve/wiki/${article.slug}/`);
    assert.ok(wiki.includes(`href="/uopve/wiki/${article.slug}/"`));
    assert.ok(html.includes(`<h1 id="article-title">${escapeHtml(article.title)}</h1>`));
    for (const section of article.sections) {
      assert.ok(html.includes(`id="${section.id}"`), article.slug);
      for (const paragraph of section.paragraphs) assert.ok(html.includes(`<p>${escapeHtml(paragraph)}</p>`), `${article.slug}: omitted or unescaped paragraph`);
    }
    for (const related of article.related) assert.ok(html.includes(`href="/uopve/wiki/${related}/"`), `${article.slug}: missing related guide`);
  }
  for (const update of data.updates) {
    assert.ok(updates.includes(`id="${update.id}"`));
    assert.ok(updates.includes(`<time datetime="${update.date}">`));
    for (const change of update.changes) assert.ok(updates.includes(`<li>${escapeHtml(change)}</li>`));
  }
  assert.match(wiki, /The Hunter&#39;s Guild/);
  assert.match(wiki, /Launcher, updates &amp; repair/);
});

test('Downloads identify the published Windows installer, portable build, digest and connection instructions', async () => {
  const html = await htmlFor('/uopve/downloads/');
  const prefix = `https://github.com/Celobra/UOPvE-Client/releases/download/client-v${data.release.version}/`;
  assert.equal(data.release.installer, prefix + 'UOPvE-Setup.exe');
  assert.equal(data.release.portable, prefix + 'UOPvE-Launcher.exe');
  assert.match(data.release.sha256, /^[a-f0-9]{64}$/);
  assert.ok(Number.isSafeInteger(data.release.sizeBytes) && data.release.sizeBytes > 0);
  assert.ok(html.includes(`class="button" href="${data.release.installer}"`));
  assert.ok(html.includes(`href="${data.release.portable}"`));
  assert.ok(html.includes(`<code>${data.release.sha256}</code>`));
  assert.ok(html.includes(`${data.release.serverHost}:${data.release.serverPort}`));
  assert.ok(html.includes(data.release.clientVersion));
  assert.match(html, /Windows 64-bit/);
  assert.match(html, /\.NET Framework 4\.8/);
  assert.match(html, /Close ClassicUO before applying an update/);
});

class Element {
  constructor({ search = '', category = '', value = '' } = {}) {
    this.dataset = { search, category };
    this.value = value;
    this.hidden = false;
    this.textContent = '';
    this.attributes = {};
    this.listeners = new Map();
  }
  addEventListener(name, listener) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(listener);
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  emit(name) { for (const listener of this.listeners.get(name) || []) listener(); }
}

const entriesFrom = (html, entry) => [...html.matchAll(new RegExp(`<article\\b[^>]*\\bdata-${entry}-entry\\b[^>]*>`, 'g'))].map(match => {
  const attr = name => decodeHtml(match[0].match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] || '');
  return new Element({ search: attr('data-search'), category: attr('data-category') });
});

test('Actual wiki and update indexes filter by all search terms and topic, restore saved controls, and report empty results', async () => {
  const wiki = entriesFrom(await htmlFor('/uopve/wiki/'), 'wiki');
  const updates = entriesFrom(await htmlFor('/uopve/updates/'), 'update');
  const ids = Object.fromEntries(['wiki-search', 'wiki-category', 'wiki-results', 'wiki-empty', 'update-search', 'update-results', 'update-empty'].map(id => [id, new Element()]));
  ids['wiki-category'].value = 'all';
  const document = new Element();
  document.readyState = 'loading';
  document.getElementById = id => ids[id] || null;
  document.querySelectorAll = selector => selector === '[data-wiki-entry]' ? wiki : selector === '[data-update-entry]' ? updates : [];
  const window = new Element();
  vm.runInNewContext(await readFile(resolve(publicRoot, 'uopve/uopve.js'), 'utf8'), { document, window });
  assert.equal(ids['wiki-search'].listeners.size, 0, 'Initialization must wait for a loading document');
  document.emit('DOMContentLoaded');
  assert.ok(wiki.every(entry => !entry.hidden));
  assert.equal(ids['wiki-results'].textContent, `${data.articles.length} articles available`);
  assert.equal(ids['wiki-results'].attributes['aria-live'], 'polite');
  ids['wiki-search'].value = 'RAZOR repair';
  ids['wiki-search'].emit('input');
  assert.equal(wiki.filter(entry => !entry.hidden).length, 1);
  assert.equal(ids['wiki-results'].textContent, '1 article found');
  ids['wiki-category'].value = 'Adventuring';
  ids['wiki-category'].emit('change');
  assert.ok(wiki.every(entry => entry.hidden));
  assert.equal(ids['wiki-empty'].hidden, false);
  ids['wiki-search'].value = '';
  ids['wiki-search'].emit('search');
  assert.equal(wiki.filter(entry => !entry.hidden).length, data.articles.filter(article => article.category === 'Adventuring').length);
  ids['wiki-category'].value = 'all';
  ids['update-search'].value = 'client maps';
  window.emit('pageshow');
  assert.ok(wiki.every(entry => !entry.hidden));
  assert.equal(ids['wiki-empty'].hidden, true);
  assert.equal(updates.filter(entry => !entry.hidden).length, 1);
  ids['update-search'].value = 'no-match-123';
  ids['update-search'].emit('input');
  assert.equal(ids['update-empty'].hidden, false);
  ids['update-search'].value = '';
  ids['update-search'].emit('search');
  assert.ok(updates.every(entry => !entry.hidden));
});
