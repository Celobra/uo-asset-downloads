import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
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
const htmlFilesUnder = async directory => {
  const files = await Promise.all((await readdir(directory, { withFileTypes: true })).map(entry => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? htmlFilesUnder(path) : entry.isFile() && entry.name.endsWith('.html') ? [path] : [];
  }));
  return files.flat();
};

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

test('The player hub and existing site sections expose the introduction, wiki, availability and updates', async () => {
  const home = await htmlFor('/uopve/');
  for (const section of ['introduction', 'wiki', 'downloads', 'updates']) assert.ok(home.includes(`href="/uopve/${section}/"`), section);
  assert.match(home, /href="\/uopve\/downloads\/"[^>]*>Availability<\/a>/);
  for (const route of ['/', '/gallery/', '/client/', '/studio/', '/studio/workflows/', '/studio/downloads/', '/studio/updates/']) {
    assert.match(await htmlFor(route), /href="\/uopve\/"/, `${route}: missing UO:PvE navigation`);
  }
});

test('The wiki and updates retain every maintained article, related route and complete plain-text entry', async () => {
  const wiki = await htmlFor('/uopve/wiki/');
  const updates = await htmlFor('/uopve/updates/');
  assert.equal(data.articles.length, 79, 'Withdrawing public play must retain the complete player reference');
  assert.equal([...wiki.matchAll(/\bdata-wiki-entry\b/g)].length, data.articles.length);
  assert.equal([...updates.matchAll(/\bdata-update-entry\b/g)].length, data.updates.length);
  for (const html of [wiki, updates]) {
    assert.match(html, /<noscript>/);
    for (const match of html.matchAll(/<(?:article|li)\b[^>]*\bdata-(?:wiki|update)-entry\b[^>]*>/g)) {
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
  const launcherGuide = data.articles.find(article => article.slug === 'launcher-and-updates');
  assert.ok(launcherGuide, 'Keep the existing launcher guide route for its availability notice');
  assert.ok(wiki.includes(escapeHtml(launcherGuide.title)));
});

test('Release metadata remains recorded privately while the public availability page offers no client downloads or connection details', async () => {
  const html = await htmlFor('/uopve/downloads/');
  const prefix = `https://github.com/Celobra/UOPvE-Client/releases/download/client-v${data.release.version}/`;
  assert.equal(data.release.installer, prefix + 'UOPvE-Setup.exe');
  assert.equal(data.release.portable, prefix + 'UOPvE-Launcher.exe');
  assert.equal(data.release.url, `https://github.com/Celobra/UOPvE-Client/releases/tag/client-v${data.release.version}`);
  assert.match(data.release.sha256, /^[a-f0-9]{64}$/);
  assert.ok(Number.isSafeInteger(data.release.sizeBytes) && data.release.sizeBytes > 0);
  assert.equal(data.availability.publicPlay, false);
  assert.equal(data.availability.message, 'UO:PvE is still in development. Public play and launcher downloads are not available yet.');
  assert.ok(html.includes(escapeHtml(data.availability.message)));
  assert.match(html, /href="\/uopve\/wiki\/"/);
  for (const value of [data.release.installer, data.release.portable, data.release.url, data.release.sha256, data.release.serverHost]) {
    assert.ok(!html.includes(value), `Private release metadata appears publicly: ${value}`);
  }
});

test('Every generated UO:PvE HTML page keeps launcher downloads and public play unavailable', async () => {
  const files = await htmlFilesUnder(resolve(publicRoot, 'uopve'));
  assert.equal(files.length, routes.length, 'Unexpected stale or missing UO:PvE pages');
  for (const file of files) {
    const html = await readFile(file, 'utf8');
    assert.doesNotMatch(html, /UOPvE-Client|live\.uoassets\.com|:2593/i, file);
    assert.doesNotMatch(html, /\/uopve\/media\/launcher\.png/i, `${file}: launcher screenshot exposed`);
    assert.ok(!html.includes(data.release.sha256), `${file}: private installer digest exposed`);
    assert.ok(html.includes(escapeHtml(data.availability.message)), `${file}: missing development notice`);
    for (const match of html.matchAll(/<(a|button)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
      const label = decodeHtml(match[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
      assert.doesNotMatch(label, /\b(?:downloads?|play)\b/i, `${file}: public download/play call to action: ${label}`);
    }
    assert.match(html, /href="\/uopve\/downloads\/"[^>]*>Availability<\/a>/, file);
  }
  for (const route of ['/uopve/', '/uopve/downloads/', '/uopve/wiki/getting-started/', '/uopve/wiki/launcher-and-updates/']) {
    assert.ok((await htmlFor(route)).includes(escapeHtml(data.availability.message)), `${route}: missing development notice`);
  }
  const introduction = await htmlFor('/uopve/introduction/');
  assert.doesNotMatch(introduction, /<img\b[^>]*\bsrc="[^"]*launcher/i, 'The introduction must not advertise a launcher screenshot');
  await assert.rejects(stat(resolve(publicRoot, 'uopve/media/launcher.png')), { code: 'ENOENT' }, 'The launcher screenshot must not remain publicly served');
  const updates = await htmlFor('/uopve/updates/');
  for (const version of ['1.0.1', '1.0.2', '1.0.3']) {
    const record = data.updates.find(update => update.id === `client-${version.replaceAll('.', '-')}`);
    assert.ok(record, `Missing historical client record ${version}`);
    assert.match(record.summary, /withdrawn/i, `Historical client version ${version} must be marked withdrawn`);
    assert.equal(record.link, '/uopve/downloads/', `${version}: historical release must point to availability`);
    assert.ok(updates.includes(version), `Missing historical client version ${version}`);
    assert.ok(updates.includes(escapeHtml(record.summary)), `${version}: withdrawn status omitted publicly`);
  }
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
  constructor({ search = '', category = '', value = '', id = '', tagName = 'DIV', attributes = {} } = {}) {
    this.dataset = { search, category };
    this.value = value;
    this.hidden = false;
    this.textContent = '';
    this.id = id;
    this.tagName = tagName;
    this.open = false;
    this.parentElement = null;
    this.children = [];
    this.scrolls = [];
    this.attributes = attributes;
    this.listeners = new Map();
  }
  addEventListener(name, listener) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(listener);
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  append(child) { child.parentElement = this; this.children.push(child); return child; }
  contains(target) { return this === target || this.children.some(child => child.contains(target)); }
  querySelector(selector) {
    if (selector !== '[data-wiki-topic-count]') return null;
    return this.children.find(child => child.dataset.wikiTopicCount !== undefined)
      || this.children.map(child => child.querySelector(selector)).find(Boolean) || null;
  }
  closest(selector) {
    if (selector === 'a[href]' && this.tagName === 'A' && this.getAttribute('href') !== null) return this;
    return this.parentElement?.closest(selector) || null;
  }
  scrollIntoView(options) { this.scrolls.push(options); }
  emit(name, event = {}) { for (const listener of this.listeners.get(name) || []) listener(event); }
}

const entriesFrom = (html, entry) => [...html.matchAll(new RegExp(`<(?:article|li)\\b[^>]*\\bdata-${entry}-entry\\b[^>]*>`, 'g'))].map(match => {
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
  assert.equal(ids['wiki-results'].textContent, `${data.articles.length} guides available`);
  assert.equal(ids['wiki-results'].attributes['aria-live'], 'polite');
  ids['wiki-search'].value = 'OPENING status';
  ids['wiki-search'].emit('input');
  assert.equal(wiki.filter(entry => !entry.hidden).length, 1);
  assert.equal(ids['wiki-results'].textContent, '1 guide found');
  ids['wiki-category'].value = 'Adventuring';
  ids['wiki-category'].emit('change');
  assert.ok(wiki.every(entry => entry.hidden));
  assert.equal(ids['wiki-empty'].hidden, false);
  ids['wiki-search'].value = '';
  ids['wiki-search'].emit('search');
  assert.equal(wiki.filter(entry => !entry.hidden).length, data.articles.filter(article => article.category === 'Adventuring').length);
  ids['wiki-category'].value = 'all';
  ids['update-search'].value = 'talent cooldown';
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

const attributeFrom = (opening, name) => decodeHtml(opening.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] || '');
const rowsFrom = (html, prefix) => [...html.matchAll(/<tr\b[^>]*\bdata-reference-entry="[^"]+"[^>]*>/g)]
  .filter(match => attributeFrom(match[0], 'data-reference-entry') === prefix)
  .map(match => new Element({ tagName: 'TR', search: attributeFrom(match[0], 'data-search') }));
const sectionsFrom = (html, marker, entries) => [...html.matchAll(new RegExp(`<section\\b[^>]*\\b${marker}\\b[^>]*>([\\s\\S]*?)<\\/section>`, 'g'))].map(match => {
  const element = new Element({ tagName: 'SECTION', id: attributeFrom(match[0].slice(0, match[0].indexOf('>') + 1), 'id') });
  const children = entries(match[1]);
  element.entries = children;
  for (const child of children) element.append(child);
  const countMatch = match[1].match(/<span\b[^>]*\bdata-wiki-topic-count\b[^>]*>(.*?)<\/span>/);
  if (countMatch) {
    const count = element.append(new Element({ tagName: 'SPAN' }));
    count.dataset.wikiTopicCount = '';
    count.textContent = countMatch[1];
  }
  return element;
});
const referenceLayoutFrom = (html, prefix = 'article-reference') => {
  const groups = [], rows = [];
  const sections = [...html.matchAll(/<section\b[^>]*>([\s\S]*?)<\/section>/g)].map(match => {
    const opening = match[0].slice(0, match[0].indexOf('>') + 1);
    const section = new Element({ tagName: 'SECTION', id: attributeFrom(opening, 'id') });
    if (attributeFrom(opening, 'data-reference-section') === prefix) {
      section.dataset.referenceSection = prefix;
      groups.push(section);
    }
    section.paragraphs = [...match[1].matchAll(/<p\b[^>]*>(.*?)<\/p>/g)].map(paragraph => {
      const element = section.append(new Element({ tagName: 'P' }));
      element.textContent = decodeHtml(paragraph[1]);
      return element;
    });
    for (const wrapperMatch of match[1].matchAll(/<div\b[^>]*\bdata-reference-section="[^"]+"[^>]*>([\s\S]*?)<\/div>/g)) {
      if (attributeFrom(wrapperMatch[0], 'data-reference-section') !== prefix) continue;
      const wrapper = section.append(new Element());
      wrapper.dataset.referenceSection = prefix;
      groups.push(wrapper);
      for (const row of rowsFrom(wrapperMatch[1], prefix)) { wrapper.append(row); rows.push(row); }
    }
    return section;
  });
  return { sections, groups, rows };
};
const filterIds = names => Object.fromEntries(names.map(id => [id, new Element({ id })]));
const interactionRuntime = async ({ ids = {}, selectors = {}, desktop = false, hash = '' } = {}) => {
  const document = new Element();
  document.readyState = 'complete';
  document.getElementById = id => ids[id] || null;
  document.querySelectorAll = selector => selectors[selector] || [];
  const window = new Element();
  window.location = { hash };
  const mediaQueries = [];
  window.matchMedia = query => { mediaQueries.push(query); return { matches: desktop }; };
  const frames = [];
  window.requestAnimationFrame = callback => frames.push(callback);
  vm.runInNewContext(await readFile(resolve(publicRoot, 'uopve/uopve.js'), 'utf8'), { document, window });
  return { document, window, mediaQueries, flushFrames: () => { while (frames.length) frames.shift()(); } };
};

test('The wiki directory groups plain guide rows by topic and articles keep contents accessible without JavaScript', async () => {
  const wiki = await htmlFor('/uopve/wiki/');
  const groups = sectionsFrom(wiki, 'data-wiki-topic', body => entriesFrom(body, 'wiki'));
  assert.equal(groups.length, new Set(data.articles.map(article => article.category)).size);
  assert.equal(groups.flatMap(group => group.entries).length, data.articles.length);
  assert.doesNotMatch(wiki, /class="wiki-card"|class="wiki-grid"/);
  assert.equal([...wiki.matchAll(/<li\b[^>]*\bdata-wiki-entry\b/g)].length, data.articles.length);
  for (const group of groups) assert.ok(wiki.includes(`data-wiki-topic-link="${group.id}"`), `Missing topic navigation for ${group.id}`);
  for (const article of data.articles) {
    const html = await htmlFor(`/uopve/wiki/${article.slug}/`);
    const contents = html.match(/<details\b[^>]*\bdata-wiki-contents\b[^>]*>/)?.[0];
    assert.ok(contents, article.slug);
    assert.doesNotMatch(contents.replace(/="[^"]*"/g, ''), /\bopen\b/, `${article.slug}: mobile contents must start collapsed in HTML`);
    assert.match(html, /<summary>Contents<\/summary>/);
  }
});

test('Wiki search hides empty topic groups and their navigation links, then restores them with cleared or restored controls', async () => {
  const html = await htmlFor('/uopve/wiki/');
  const groups = sectionsFrom(html, 'data-wiki-topic', body => entriesFrom(body, 'wiki'));
  const entries = groups.flatMap(group => group.entries);
  const links = [...html.matchAll(/<a\b[^>]*\bdata-wiki-topic-link="[^"]+"[^>]*>/g)].map(match => {
    const link = new Element({ tagName: 'A', attributes: { href: attributeFrom(match[0], 'href') } });
    link.dataset.wikiTopicLink = attributeFrom(match[0], 'data-wiki-topic-link');
    return link;
  });
  const ids = filterIds(['wiki-search', 'wiki-category', 'wiki-results', 'wiki-empty']);
  ids['wiki-category'].value = 'all';
  const runtime = await interactionRuntime({ ids, selectors: { '[data-wiki-entry]': entries, '[data-wiki-topic]': groups, '[data-wiki-topic-link]': links } });
  assert.equal(groups.length, links.length);
  assert.ok(groups.every(group => !group.hidden));
  assert.ok(links.every(link => !link.hidden));
  for (const group of groups) assert.equal(group.querySelector('[data-wiki-topic-count]')?.textContent, `${group.entries.length} guide${group.entries.length === 1 ? '' : 's'}`);
  ids['wiki-search'].value = 'OPENING status'; ids['wiki-search'].emit('input');
  assert.equal(entries.filter(entry => !entry.hidden).length, 1);
  assert.equal(groups.filter(group => !group.hidden).length, 1);
  assert.equal(links.filter(link => !link.hidden).length, 1);
  assert.equal(groups.find(group => !group.hidden).querySelector('[data-wiki-topic-count]').textContent, '1 guide');
  for (const group of groups) assert.equal(links.find(link => link.dataset.wikiTopicLink === group.id).hidden, group.hidden);
  ids['wiki-category'].value = 'Adventuring'; ids['wiki-category'].emit('change');
  assert.ok(groups.every(group => group.hidden));
  assert.ok(links.every(link => link.hidden));
  assert.equal(ids['wiki-empty'].hidden, false);
  ids['wiki-search'].value = ''; ids['wiki-search'].emit('search');
  assert.equal(groups.filter(group => !group.hidden).length, 1);
  assert.ok(entries.filter(entry => !entry.hidden).every(entry => entry.dataset.category === 'Adventuring'));
  ids['wiki-search'].value = 'guild'; ids['wiki-search'].emit('input');
  const matchingGuides = entries.filter(entry => !entry.hidden).length;
  assert.ok(matchingGuides > 1, 'Exercise a filtered topic containing multiple matches');
  assert.equal(groups.find(group => !group.hidden).querySelector('[data-wiki-topic-count]').textContent, `${matchingGuides} guides`);
  ids['wiki-search'].value = '';
  ids['wiki-category'].value = 'all'; runtime.window.emit('pageshow');
  assert.ok(groups.every(group => !group.hidden));
  assert.ok(links.every(link => !link.hidden));
  assert.ok(entries.every(entry => !entry.hidden));
  assert.equal(ids['wiki-empty'].hidden, true);
  for (const group of groups) assert.equal(group.querySelector('[data-wiki-topic-count]').textContent, `${group.entries.length} guide${group.entries.length === 1 ? '' : 's'}`);
});

test('Large reference guides provide one search across all tables while smaller guides retain their table filters', async () => {
  for (const article of data.articles) {
    const tables = article.sections.flatMap(section => section.tables || []);
    const rowCount = tables.reduce((sum, table) => sum + table.rows.length, 0);
    const shared = tables.length > 1 && rowCount > 40;
    const html = await htmlFor(`/uopve/wiki/${article.slug}/`);
    assert.equal([...html.matchAll(/\bdata-reference-filter="article-reference"/g)].length, shared ? 1 : 0, article.slug);
    if (shared) {
      assert.equal(rowsFrom(html, 'article-reference').length, rowCount, article.slug);
      const tableOnlySections = article.sections.filter(section => section.tables?.length && !section.paragraphs?.length && !section.lists?.length).length;
      assert.equal([...html.matchAll(/\bdata-reference-section="article-reference"/g)].length, tables.length + tableOnlySections, article.slug);
      assert.equal([...html.matchAll(/\bdata-reference-filter=/g)].length, 1, `${article.slug}: redundant per-table filters`);
    } else {
      assert.equal([...html.matchAll(/\bdata-reference-filter=/g)].length, tables.filter(table => table.rows.length > 15).length, article.slug);
    }
  }
});

test('Shared reference search filters actual weapon rows and empty sections; a contents hash restores a hidden section before scrolling', async () => {
  const html = await htmlFor('/uopve/wiki/weapons-reference/');
  const layout = referenceLayoutFrom(html);
  const sections = layout.sections.filter(section => section.dataset.referenceSection === 'article-reference');
  const rows = layout.rows;
  const ids = filterIds(['article-reference-search', 'article-reference-results', 'article-reference-empty']);
  ids['article-reference-search'].dataset.referenceFilter = 'article-reference';
  for (const section of sections) ids[section.id] = section;
  const intro = layout.sections.find(section => section.id === 'reading'); ids.reading = intro;
  const runtime = await interactionRuntime({ ids, selectors: { '[data-reference-filter]': [ids['article-reference-search']], '[data-reference-entry="article-reference"]': rows, '[data-reference-section="article-reference"]': layout.groups } });
  assert.equal(rows.length, 468);
  assert.ok(sections.every(section => !section.hidden));
  ids['article-reference-search'].value = 'assassin shortbow'; ids['article-reference-search'].emit('input');
  assert.equal(rows.filter(row => !row.hidden).length, 1);
  assert.equal(sections.filter(section => !section.hidden).length, 1);
  assert.equal(intro.hidden, false, 'Narrative guidance must remain readable');
  assert.equal(ids['article-reference-results'].textContent, '1 entry found');
  ids['article-reference-search'].value = 'no-match-123'; ids['article-reference-search'].emit('search');
  assert.ok(sections.every(section => section.hidden));
  assert.equal(ids['article-reference-empty'].hidden, false);
  ids['article-reference-search'].value = ''; runtime.window.emit('pageshow');
  assert.ok(rows.every(row => !row.hidden));
  assert.ok(sections.every(section => !section.hidden));
  assert.equal(ids['article-reference-empty'].hidden, true);
  ids['article-reference-search'].value = 'assassin shortbow'; ids['article-reference-search'].emit('input');
  const target = sections.find(section => section.hidden);
  runtime.window.location.hash = '#' + target.id;
  runtime.window.emit('hashchange');
  assert.equal(ids['article-reference-search'].value, '');
  assert.ok(sections.every(section => !section.hidden));
  assert.equal(target.scrolls.length, 0, 'Wait for restored rows to enter layout');
  runtime.flushFrames();
  assert.equal(target.scrolls.length, 1);
});

test('Filtering a real mixed reference section keeps its caveats readable and a contents link restores the section’s table', async () => {
  const html = await htmlFor('/uopve/wiki/shops-and-services/');
  const { sections, groups, rows } = referenceLayoutFrom(html);
  const target = sections.find(section => section.id === 'appearance');
  const source = data.articles.find(article => article.slug === 'shops-and-services').sections.find(section => section.id === 'appearance');
  assert.equal(target.paragraphs.length, source.paragraphs.length);
  assert.ok(target.paragraphs.length > 0, 'Use an actual caveat-bearing section');
  for (const paragraph of source.paragraphs) assert.ok(target.paragraphs.some(element => element.textContent === paragraph));
  const table = target.children.find(child => child.dataset.referenceSection === 'article-reference');
  assert.ok(table);
  const ids = filterIds(['article-reference-search', 'article-reference-results', 'article-reference-empty']);
  ids['article-reference-search'].dataset.referenceFilter = 'article-reference';
  for (const section of sections) ids[section.id] = section;
  const runtime = await interactionRuntime({ ids, selectors: { '[data-reference-filter]': [ids['article-reference-search']], '[data-reference-entry="article-reference"]': rows, '[data-reference-section="article-reference"]': groups } });
  ids['article-reference-search'].value = 'no-match-123'; ids['article-reference-search'].emit('input');
  assert.equal(target.hidden, false, 'The appearance guidance must stay readable with zero matching rows');
  assert.ok(target.paragraphs.every(paragraph => !paragraph.hidden));
  assert.equal(table.hidden, true);
  runtime.window.location.hash = '#appearance'; runtime.window.emit('hashchange');
  assert.equal(ids['article-reference-search'].value, '');
  assert.equal(target.hidden, false);
  assert.equal(table.hidden, false, 'A section link must restore its hidden descendant table');
  assert.ok(table.children.every(row => !row.hidden));
  runtime.flushFrames(); assert.equal(target.scrolls.length, 1);
});

test('Creature and loot deep links expand details and ancestors; hidden targets clear only relevant filters and same-hash clicks work', async () => {
  const html = await htmlFor('/uopve/wiki/creature-bestiary/');
  const creatures = [...html.matchAll(/<details\b[^>]*\bdata-bestiary-entry\b[^>]*>/g)].map(match => new Element({
    id: attributeFrom(match[0], 'id'), tagName: 'DETAILS', search: attributeFrom(match[0], 'data-search'), category: attributeFrom(match[0], 'data-category'),
  }));
  const lootOpening = html.match(/<details\b[^>]*class="loot-pool"[^>]*>/)?.[0];
  assert.ok(lootOpening, 'The bestiary retains usable loot disclosures');
  const loot = new Element({ id: attributeFrom(lootOpening, 'id'), tagName: 'DETAILS' });
  const target = creatures[0];
  const ancestor = new Element({ tagName: 'DETAILS' }); ancestor.append(target); ancestor.append(loot);
  const ids = filterIds(['bestiary-search', 'bestiary-category', 'bestiary-results', 'bestiary-empty']);
  for (const creature of creatures) ids[creature.id] = creature;
  ids[loot.id] = loot;
  ids['bestiary-search'].value = 'no-match-123'; ids['bestiary-category'].value = 'Vendors';
  const runtime = await interactionRuntime({ ids, selectors: { '[data-bestiary-entry]': creatures }, hash: '#' + encodeURIComponent(target.id) });
  assert.equal(ids['bestiary-search'].value, '');
  assert.equal(ids['bestiary-category'].value, 'all');
  assert.ok(creatures.every(creature => !creature.hidden));
  assert.equal(target.open, true);
  assert.equal(ancestor.open, true);
  runtime.flushFrames(); assert.equal(target.scrolls.length, 1);
  ids['bestiary-search'].value = 'no-match-123'; ids['bestiary-search'].emit('input');
  target.open = false; ancestor.open = false;
  const anchor = new Element({ tagName: 'A', attributes: { href: '#' + target.id } });
  const icon = anchor.append(new Element({ tagName: 'SPAN' }));
  for (const event of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { defaultPrevented: true }]) {
    runtime.document.emit('click', { target: icon, button: 0, ...event });
    assert.equal(ids['bestiary-search'].value, 'no-match-123', 'Modified or canceled navigation must not change filters');
    assert.equal(target.open, false);
  }
  const external = new Element({ tagName: 'A', attributes: { href: '/uopve/wiki/another/#' + target.id } });
  runtime.document.emit('click', { target: external, button: 0 });
  assert.equal(ids['bestiary-search'].value, 'no-match-123');
  runtime.document.emit('click', { target: icon, button: 0 });
  assert.equal(ids['bestiary-search'].value, '', 'A repeated hash click must reveal its target without a hashchange event');
  assert.equal(target.open, true);
  assert.equal(ancestor.open, true);
  runtime.flushFrames(); assert.equal(target.scrolls.length, 2);
  ids['bestiary-search'].value = 'no-match-123'; ids['bestiary-search'].emit('input');
  ancestor.open = false;
  runtime.window.location.hash = '#' + loot.id; runtime.window.emit('hashchange');
  assert.equal(loot.open, true);
  assert.equal(ancestor.open, true);
  assert.equal(ids['bestiary-search'].value, 'no-match-123', 'A loot link must preserve an unrelated creature search');
  runtime.flushFrames(); assert.equal(loot.scrolls.length, 1);
  runtime.window.location.hash = '#' + target.id;
  target.open = false;
  runtime.window.emit('pageshow', { persisted: true });
  runtime.flushFrames();
  assert.equal(ids['bestiary-search'].value, 'no-match-123', 'Back navigation must preserve an intentional filter even with an earlier hash');
  assert.equal(target.hidden, true);
  assert.equal(target.open, false);
  assert.equal(target.scrolls.length, 2, 'Back navigation must retain the browser-restored reading position');
  runtime.window.emit('pageshow', { persisted: false });
  runtime.flushFrames();
  assert.equal(target.hidden, false, 'A fresh page must reveal its hash after input restoration');
  assert.equal(target.open, true);
  assert.equal(target.scrolls.length, 2, 'Input restoration must not add a second hash scroll');
  runtime.window.location.hash = '#%E0%A4%A';
  assert.doesNotThrow(() => runtime.window.emit('hashchange'), 'Malformed percent escapes must not break the page');
  runtime.window.location.hash = '#missing-id';
  assert.doesNotThrow(() => runtime.window.emit('hashchange'));
});

test('Contents start open only on desktop and remain under the reader’s control after toggling, resize and browser restoration', async () => {
  const html = await htmlFor('/uopve/wiki/weapons-reference/');
  assert.match(html, /<details class="wiki-contents" data-wiki-contents>/);
  for (const desktop of [false, true]) {
    const contents = new Element({ tagName: 'DETAILS' });
    const runtime = await interactionRuntime({ desktop, selectors: { '[data-wiki-contents]': [contents] } });
    assert.deepEqual(runtime.mediaQueries, ['(min-width: 900px)']);
    assert.equal(contents.open, desktop);
    contents.open = !desktop;
    runtime.window.emit('resize'); runtime.window.emit('pageshow', { persisted: true });
    assert.equal(contents.open, !desktop, 'The reader’s explicit toggle must survive viewport changes and back navigation');
  }
});
