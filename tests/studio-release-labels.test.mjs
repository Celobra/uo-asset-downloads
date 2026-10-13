import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const metadata = JSON.parse(await readFile(resolve(root, 'data/studio-release.json'), 'utf8'));
const html = await readFile(resolve(root, 'public/studio/downloads/index.html'), 'utf8');
const version = metadata.version;
assert.match(version, /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/);

function oneMatch(source, pattern, label) {
  const matches = [...source.matchAll(pattern)];
  assert.equal(matches.length, 1, `${label} must appear exactly once`);
  return matches[0];
}

function description(attribute, name) {
  const matches = [];
  for (const tag of html.matchAll(/<meta\b([^>]*)>/gi)) {
    const attrs = Object.fromEntries([...tag[1].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
      .map(match => [match[1].toLowerCase(), match[2] ?? match[3]]));
    if (attrs[attribute] === name) matches.push(attrs.content);
  }
  assert.equal(matches.length, 1, `${name} metadata must appear exactly once`);
  assert.equal(typeof matches[0], 'string');
  return matches[0];
}

function installerLabel(label) {
  const article = oneMatch(html, /<article\b[^>]*class="download-main"[^>]*>([\s\S]*?)<\/article>/g,
    'primary installer card')[1];
  return oneMatch(article, new RegExp(`<dt>\\s*${label}\\s*</dt>\\s*<dd>\\s*([^<]*?)\\s*</dd>`, 'g'),
    `installer ${label}`)[1].trim();
}

function descriptionVersion(text, label) {
  return oneMatch(text, /\bUO Asset Studio\s+(\d+\.\d+\.\d+)\b/g, label)[1];
}

test('Download header advertises the current updater version', () => {
  const header = oneMatch(html,
    /<p\b[^>]*class="eyebrow"[^>]*>\s*UO ASSET STUDIO \/ VERSION (\d+\.\d+\.\d+)\s*<\/p>/g,
    'current download version header')[1];
  assert.equal(header, version);
});

test('Primary installer Version matches the current updater version', () => {
  assert.equal(installerLabel('Version'), version);
});

test('Primary installer Release matches the current updater version', () => {
  assert.equal(installerLabel('Release'), version);
});

test('Download search description matches the current updater version', () => {
  assert.equal(descriptionVersion(description('name', 'description'), 'search description version'), version);
});

test('Download social description matches the current updater version', () => {
  assert.equal(descriptionVersion(description('property', 'og:description'), 'social description version'), version);
});

