import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const json = async name => JSON.parse(await readFile(resolve(root, name), 'utf8'));

test('SphereX public release and download page identify the same preview packages', async () => {
  const release = await json('data/spherex-release.json');
  const published = await json('public/spherex/release.json');
  const page = await readFile(resolve(root, 'public/spherex/index.html'), 'utf8');
  assert.deepEqual(published, release);
  assert.equal(release.status, 'unsigned custom Nightly development preview');
  assert.match(page, /Unsigned Nightly preview/);
  for (const [name, artifact] of Object.entries(release.artifacts)) {
    assert.match(artifact.sha256, /^[a-f0-9]{64}$/);
    assert.ok(artifact.bytes > 0);
    assert.ok(Object.values(release.downloads).some(url => url.endsWith('/' + name)));
  }
  for (const key of ['windows', 'source', 'checksums']) assert.ok(page.includes(release.downloads[key]));
});

test('SphereX preview publishes only fresh-world scaffolding with matching source evidence', async () => {
  const release = await json('data/spherex-release.json');
  assert.equal(release.checks.distributedAccounts, 0);
  assert.equal(release.checks.distributedWorldObjects, 0);
  assert.equal(release.checks.clientDataIncluded, false);
  assert.equal(release.source.gameplaySourceChangedForPublication, false);
  assert.equal(release.source.compilerPrefixMapped, true);
  assert.equal(release.source.verifiedNativeFiles, 587);
  assert.equal(release.scripts.unmodifiedFiles, 831);
  assert.equal(release.scripts.commit, '27e78bc896da239d3738fe02a6d6bf8e9045c16d');
  assert.match(release.executable.sha256, /^[a-f0-9]{64}$/);
  assert.equal(release.checks.freshRuntime.length, 3);
  assert.ok(release.checks.freshRuntime.every(check => check.startup && check.saveAndExit && check.diagnostics === 0));
});

test('SphereX local guide, notices, preview and page links resolve', async () => {
  const page = await readFile(resolve(root, 'public/spherex/index.html'), 'utf8');
  for (const [, url] of page.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (url.startsWith('https:') || url.startsWith('#')) continue;
    const path = url.startsWith('/') ? 'public' + url : 'public/spherex/' + url;
    await access(resolve(root, path.endsWith('/') ? path + 'index.html' : path));
  }
  assert.match(page, /not preinstalled/);
  assert.match(page, /Pause problems/);
  assert.match(page, /No GUI or performance repairs are claimed/);
  const guide = await readFile(resolve(root, 'public/spherex/guide.md'), 'utf8');
  assert.match(guide, /single-facet shard also requires/);
  assert.doesNotMatch(page + guide, /C:\\Users\\Home|desktop-vjr8rec|G:\\My Drive/);
});
