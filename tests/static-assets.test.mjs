import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateStaticAssets } from '../tools/validate-static-assets.mjs';

test('Every deployed file, including indirect animation sheets, fits the static hosting limit', async () => {
  const result = await validateStaticAssets(fileURLToPath(new URL('../public/', import.meta.url)));
  assert.ok(result.files > 0);
});

test('Oversized nested animation sheets stop the build with the offending filename', async () => {
  const root = await mkdtemp(join(tmpdir(), 'uo-static-size-test-'));
  try {
    await mkdir(join(root, 'gallery', 'sheets'), { recursive: true });
    const path = join(root, 'gallery', 'sheets', 'boss.png');
    const file = await open(path, 'w');
    try { await file.truncate(25 * 1024 * 1024 + 1); } finally { await file.close(); }
    await assert.rejects(validateStaticAssets(root), /boss\.png/);
  } finally {
    // mkdtemp supplies a new, test-owned directory under the OS temp folder.
    assert.equal(root.startsWith(join(tmpdir(), 'uo-static-size-test-')), true);
    await rm(root, { recursive: true, force: true });
  }
});
