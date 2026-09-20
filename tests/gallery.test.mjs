import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateGallery } from '../tools/validate-gallery.mjs';

test('Every published item and armour piece has an intact native download and real preview files', async () => {
  const result = await validateGallery();
  assert.equal(result.items, 551);
  assert.equal(result.listings, 332);
  assert.equal(result.sets, 30);
  assert.equal(result.packages, 418);
});

test('Homepage resolves gallery media and downloads from its subdirectory', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('<base href="./gallery/">'));
  assert.ok(html.includes('id="native-downloads"'));
});
