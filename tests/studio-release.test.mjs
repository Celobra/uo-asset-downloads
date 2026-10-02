import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateStudioRelease } from '../tools/build-studio-release.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const example = () => ({ schema_version: 1, app_id: 'uo-asset-studio', version: '0.32.3',
  release_notes_url: 'https://www.uoassets.com/studio/updates/',
  installer: { url: 'https://github.com/Celobra/uo-asset-downloads/releases/download/uo-asset-studio-v0.32.3/UOAssetStudio-Setup-0.32.3.exe',
    sha256: '1234567890abcdef'.repeat(4), size: 17000000 } });
const history = [{ version: '0.32.3', release: true }, { version: '0.32.2', release: true }];
const linkedPage = value => `<a href="${value.installer.url}">Windows installer</a>`;

test('Studio updater metadata retains the version and exact verified installer identity', () => {
  const value = example();
  assert.deepEqual(validateStudioRelease(value, history, [linkedPage(value)]), value);
  const newer = example();
  newer.version = '0.32.10';
  newer.installer.url = newer.installer.url.replaceAll('0.32.3', newer.version);
  assert.equal(validateStudioRelease(newer, [{ version: '0.32.10', release: true }]).version, '0.32.10');
});

test('Studio updater rejects malformed versions, application IDs, digests and installer lengths', () => {
  const variants = [
    value => value.schema_version = 2,
    value => value.app_id = 'another-app',
    value => value.extra = 'unsupported metadata',
    value => value.installer.args = '/unsupported',
    value => value.version = '0.32.3-beta',
    value => value.version = '0.032.3',
    value => value.version = '9007199254740992.1.0',
    value => value.version = '2147483648.1.0',
    value => value.version = '0.32.3\n',
    value => value.version = '0.32.3\r',
    value => value.installer.sha256 = 'pending',
    value => value.installer.sha256 = '0'.repeat(64),
    value => value.installer.sha256 = 'A'.repeat(64),
    value => value.installer.sha256 += '\n',
    value => value.installer.size = '17000000',
    value => value.installer.size = -1,
    value => value.installer.size = 1.5,
    value => value.installer.size = 257 * 1024 * 1024,
    value => value.installer = null
  ];
  for (const mutate of variants) {
    const value = example();
    mutate(value);
    assert.throws(() => validateStudioRelease(value, history));
  }
});

test('Studio updater refuses stale releases and mismatched or external installer URLs', () => {
  assert.throws(() => validateStudioRelease(example(), [{ version: '0.32.2', release: true }]));
  assert.throws(() => validateStudioRelease(example(), [{ version: '0.32.3', release: false }]));
  assert.throws(() => validateStudioRelease(example(), [...history, history[0]]));
  assert.throws(() => validateStudioRelease(example(), [...history, { version: '0.32.10', release: true }]));
  for (const url of [
    example().installer.url.replace('v0.32.3/', 'v0.32.2/'),
    example().installer.url.replace('Setup-0.32.3', 'Setup-0.32.2'),
    example().installer.url.replace('https:', 'http:'),
    example().installer.url.replace('github.com/', 'github.com.evil.test/'),
    example().installer.url + '?replacement=true'
  ]) {
    const value = example();
    value.installer.url = url;
    assert.throws(() => validateStudioRelease(value, history));
  }
  assert.throws(() => validateStudioRelease(example(), history, ['<a href="https://github.com/Celobra/uo-asset-downloads/releases/download/uo-asset-studio-v0.32.2/UOAssetStudio-Setup-0.32.2.exe">Install</a>']));
  assert.throws(() => validateStudioRelease(example(), history, ['<p>No installer</p>']));
});

test('Published Studio updater JSON is generated from the validated release record and matches page downloads', async () => {
  const value = JSON.parse(await readFile(resolve(root, 'data/studio-release.json'), 'utf8'));
  const { releases } = JSON.parse(await readFile(resolve(root, 'data/studio-updates.json'), 'utf8'));
  const pages = await Promise.all(['index.html', 'studio/index.html', 'studio/workflows/index.html', 'studio/downloads/index.html', 'studio/updates/index.html']
    .map(page => readFile(resolve(root, 'public', page), 'utf8')));
  const expected = validateStudioRelease(value, releases, pages);
  assert.deepEqual(JSON.parse(await readFile(resolve(root, 'public/studio/update.json'), 'utf8')), expected);
  const headers = await readFile(resolve(root, 'public/_headers'), 'utf8');
  assert.match(headers, /\/studio\/update\.json\r?\n  Cache-Control: no-cache, no-store, must-revalidate\r?\n  Content-Type: application\/json; charset=utf-8/);
  const config = JSON.parse(await readFile(resolve(root, 'wrangler.jsonc'), 'utf8'));
  assert.equal(config.assets.directory, './public');
});
