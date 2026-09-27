import { readdir, stat } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

export async function validateStaticAssets(root) {
  let files = 0;
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) {
        const { size } = await stat(path);
        if (size > 25 * 1024 * 1024) throw Error('Static asset exceeds 25 MiB: ' + relative(root, path));
        files++;
      }
    }
  }
  await visit(root);
  return { files };
}
