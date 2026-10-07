import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { renderBestiary } from '../tools/uopve-bestiary.mjs';

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
      assert.doesNotMatch(match[0].replace(/="[^"]*"/g, ''), /\bhidden\b/, 'Entries must remain visible without JavaScript');
    }
  }
  for (const article of data.articles) {
    const html = await htmlFor(`/uopve/wiki/${article.slug}/`);
    assert.ok(wiki.includes(`href="/uopve/wiki/${article.slug}/"`));
    assert.ok(html.includes(`<h1 id="article-title">${escapeHtml(article.title)}</h1>`));
    for (const section of article.sections) {
      assert.ok(html.includes(`id="${section.id}"`), article.slug);
      for (const paragraph of section.paragraphs) assert.ok(html.includes(`<p>${escapeHtml(paragraph)}</p>`), `${article.slug}: omitted or unescaped paragraph`);
      for (const list of section.lists || []) for (const item of list.items) assert.ok(html.includes(`<li>${escapeHtml(item)}</li>`), `${article.slug}: omitted or unescaped list item`);
      for (const table of section.tables || []) {
        for (const column of table.columns) assert.ok(html.includes(`<th scope="col">${escapeHtml(column)}</th>`), `${article.slug}: missing table column`);
        for (const row of table.rows) row.forEach((cell, index) => assert.ok(html.includes(index === 0 ? `<th scope="row">${escapeHtml(cell)}</th>` : `<td>${escapeHtml(cell)}</td>`), `${article.slug}: omitted or unescaped table cell`));
      }
    }
    for (const related of article.related) assert.ok(html.includes(`href="/uopve/wiki/${related}/"`), `${article.slug}: missing related guide`);
  }
  for (const update of data.updates) {
    assert.ok(updates.includes(`id="${update.id}"`));
    assert.ok(updates.includes(`<time datetime="${update.changedAt || update.date}">`));
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

test('The complete bestiary has one usable entry per definition, safe loot links and escaped content', async () => {
  const bestiary = JSON.parse(await readFile(resolve(root, 'data/uopve-bestiary.json'), 'utf8'));
  const html = await htmlFor('/uopve/wiki/creature-bestiary/');
  assert.equal([...html.matchAll(/\bdata-bestiary-entry\b/g)].length, bestiary.creatures.length);
  assert.equal(bestiary.creatures.length, 1136);
  for (const creature of bestiary.creatures) {
    const id = creature.id.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    assert.ok(html.includes(`id="creature-${id}"`), creature.id);
    assert.ok(html.includes(escapeHtml(creature.name)), creature.id);
  }
  assert.doesNotMatch(JSON.stringify(bestiary), /"(?:source|provenance|declaration)":|C:[\\/]|\\\\desktop-/i);
  const hostile = renderBestiary({ creatures: [{ id: 'example', name: '<script>alert(1)</script>', loot: ['<img src=x onerror=alert(1)>'] }] });
  assert.ok(hostile.includes('&lt;script&gt;'));
  assert.doesNotMatch(hostile, /<script|<img src=x/);
  assert.throws(() => renderBestiary({ creatures: [{id:'a_b'}, {id:'a-b'}] }), /unique/);
});

test('Gameplay timestamps include the recorded London time and seasonal timezone', async () => {
  const html = await htmlFor('/uopve/updates/');
  assert.ok(html.includes('7 October 2026 at 19:15 BST'));
  assert.ok(html.includes('datetime="2026-10-07T19:15:54+01:00"'));
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

test('Creature and reference table search report matches, combine categories and clear empty results', async () => {
  const html = await htmlFor('/uopve/wiki/creature-bestiary/');
  const creatures = [...html.matchAll(/<details\b[^>]*\bdata-bestiary-entry\b[^>]*>/g)].map(match => {
    const attr = name => decodeHtml(match[0].match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] || '');
    return new Element({search:attr('data-search'), category:attr('data-category')});
  });
  const ids = Object.fromEntries(['bestiary-search','bestiary-category','bestiary-results','bestiary-empty','reference-example-search','reference-example-results','reference-example-empty'].map(id => [id,new Element()]));
  ids['bestiary-category'].value = 'all';
  ids['reference-example-search'].id = 'reference-example-search';
  ids['reference-example-search'].dataset.referenceFilter = 'reference-example';
  const rows = [new Element({search:'Copper sword 30'}), new Element({search:'Iron dagger 20'})];
  const document = new Element();
  document.readyState = 'complete';
  document.getElementById = id => ids[id] || null;
  document.querySelectorAll = selector => selector === '[data-bestiary-entry]' ? creatures : selector === '[data-reference-filter]' ? [ids['reference-example-search']] : selector === '[data-reference-entry="reference-example"]' ? rows : [];
  const window = new Element();
  vm.runInNewContext(await readFile(resolve(publicRoot,'uopve/uopve.js'),'utf8'),{document,window});
  assert.equal(ids['bestiary-results'].textContent,'1136 creatures available');
  ids['bestiary-search'].value='green dragon';
  ids['bestiary-search'].emit('input');
  assert.ok(creatures.some(entry => !entry.hidden));
  assert.ok(creatures.filter(entry => !entry.hidden).every(entry => entry.dataset.search.toLowerCase().includes('dragon')));
  ids['bestiary-category'].value='Vendors';
  ids['bestiary-category'].emit('change');
  assert.equal(ids['bestiary-empty'].hidden,false);
  ids['bestiary-search'].value=''; ids['bestiary-category'].value='all'; window.emit('pageshow');
  assert.ok(creatures.every(entry => !entry.hidden));
  assert.equal(ids['reference-example-results'].textContent,'2 entries available');
  ids['reference-example-search'].value='copper 30'; ids['reference-example-search'].emit('input');
  assert.equal(ids['reference-example-results'].textContent,'1 entry found');
  ids['reference-example-search'].value='unknown'; ids['reference-example-search'].emit('search');
  assert.equal(ids['reference-example-empty'].hidden,false);
  ids['reference-example-search'].value=''; ids['reference-example-search'].emit('search');
  assert.ok(rows.every(entry => !entry.hidden));
  assert.equal(ids['reference-example-empty'].hidden,true);
});
