import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateGallery } from '../tools/validate-gallery.mjs';

test('Every published item and armour piece has an intact native download and real preview files', async () => {
  const result = await validateGallery();
  assert.equal(result.items, 564);
  assert.equal(result.listings, 341);
  assert.equal(result.sets, 32);
  assert.equal(result.packages, 431);
  assert.equal(result.paperdolls, 326);
});

test('Homepage resolves gallery media and downloads from its subdirectory', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('<base href="./gallery/">'));
  assert.ok(html.includes('id="native-downloads"'));
  assert.ok(html.includes('since I was 11'));
  assert.ok(html.includes('GM for Soulless'));
  assert.ok(html.includes('href="https://invictauo.com/"'));
  assert.ok(html.includes('id="library"'));
  assert.ok(!/[\u00c2\u00c3]/.test(html), 'Homepage has no broken UTF-8 punctuation');
});
