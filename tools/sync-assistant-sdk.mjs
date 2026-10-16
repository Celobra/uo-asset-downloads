import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, dirname, extname } from 'node:path';
import { createHash } from 'node:crypto';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const textExtensions = new Set(['.js', '.json', '.ts', '.txt']);
export function normalizeSdkFile(path, bytes) {
  return textExtensions.has(extname(path).toLowerCase())
    ? Buffer.from(new TextDecoder('utf-8', {fatal: true}).decode(bytes).replace(/^\uFEFF/, '').replaceAll('\r\n', '\n'))
    : bytes;
}

// Always supply the checked final payload's SDK, rather than the installer
// source folder, whose staged SDK may predate the final application build.
export async function syncAssistantSdk(root, sdk) {
  const release = JSON.parse(await readFile(resolve(root, 'data/assistant-release.json'), 'utf8'));
  const installer = release.artifacts?.[`UOAssistant-${release.version}-Setup.exe`];
  const source = release.artifacts?.[`UOAssistant-${release.version}-Source.zip`];
  if (!installer?.sha256 || !source?.sha256) throw Error('Verified release identities are required before SDK synchronization');
  const files = [];
  async function visit(directory, prefix = '') {
    for (const entry of (await readdir(directory, {withFileTypes: true})).sort((a,b) => a.name.localeCompare(b.name))) {
      if (entry.isSymbolicLink()) throw Error('Assistant SDK source cannot be redirected');
      const path = prefix + entry.name;
      if (entry.isDirectory()) await visit(resolve(directory, entry.name), path + '/');
      else if (entry.isFile()) {
        const bytes = normalizeSdkFile(path, await readFile(resolve(directory, entry.name)));
        const target = resolve(root, 'public/assistant/SDK', path);
        await mkdir(dirname(target), {recursive: true});
        await writeFile(target, bytes);
        files.push({path, bytes: bytes.length, sha256: digest(bytes)});
      }
    }
  }
  await visit(sdk);
  if (!files.some(file => file.path === 'assistant.d.ts')) throw Error('Final payload SDK is missing assistant.d.ts');
  const manifest = {schema: 1, version: release.version, sourceSha256: source.sha256.toLowerCase(),
    installerSha256: installer.sha256.toLowerCase(), textNormalization: 'UTF-8 without BOM; CRLF to LF; no other text changes', files};
  await writeFile(resolve(root, 'data/assistant-sdk-release.json'), JSON.stringify(manifest, null, 2) + '\n');
  return {files: files.length, definitionsSha256: files.find(file => file.path === 'assistant.d.ts').sha256};
}
