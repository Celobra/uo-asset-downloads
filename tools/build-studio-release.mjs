import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const releaseBase = 'https://github.com/Celobra/uo-asset-downloads/releases/download/';
const currentPages = ['index.html', 'studio/index.html', 'studio/workflows/index.html', 'studio/downloads/index.html', 'studio/updates/index.html'];
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

export function validateStudioRelease(value, releases, pageHtml = []) {
  if (!exactKeys(value, ['schema_version', 'app_id', 'version', 'release_notes_url', 'installer'])
      || value.schema_version !== 1 || value.app_id !== 'uo-asset-studio') throw Error('Studio release metadata needs schema 1 and the correct application ID.');
  if (typeof value.version !== 'string' || value.version.length > 40 || value.version.trim() !== value.version
      || !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(value.version)
      || !value.version.split('.').every(part => Number.isSafeInteger(Number(part)) && Number(part) <= 2 ** 31 - 1)) throw Error('Studio release needs a stable three-part numeric version.');
  if (value.release_notes_url !== 'https://www.uoassets.com/studio/updates/') throw Error('Studio release notes must use the Studio website.');
  const installerUrl = `${releaseBase}uo-asset-studio-v${value.version}/UOAssetStudio-Setup-${value.version}.exe`;
  if (!exactKeys(value.installer, ['url', 'sha256', 'size']) || value.installer.url !== installerUrl) throw Error('Studio installer URL must match the release version and official download.');
  if (typeof value.installer.sha256 !== 'string' || value.installer.sha256.length !== 64 || !/^[0-9a-f]{64}$/.test(value.installer.sha256)
      || /^([0-9a-f])\1{63}$/.test(value.installer.sha256)) throw Error('Studio installer needs its final SHA256 digest; placeholders are not publishable.');
  if (!Number.isSafeInteger(value.installer.size) || value.installer.size < 1024 || value.installer.size > 256 * 1024 * 1024) throw Error('Studio installer size must be a verified byte count.');
  if (!Array.isArray(releases) || releases.length === 0 || releases[0].version !== value.version || releases[0].release !== true) throw Error('Studio update metadata must match the newest published release history entry.');
  if (new Set(releases.map(release => release.version)).size !== releases.length) throw Error('Studio release history needs unique versions.');
  const current = value.version.split('.').map(Number);
  for (const previous of releases.slice(1)) {
    if (typeof previous.version !== 'string' || !/^\d+\.\d+(?:\.\d+)?$/.test(previous.version)) throw Error('Studio release history has an invalid version.');
    const parts = previous.version.split('.').map(Number);
    while (parts.length < 3) parts.push(0);
    const different = current.findIndex((part, index) => part !== parts[index]);
    if (different === -1 || current[different] <= parts[different]) throw Error('Studio updater must advertise the newest stable release.');
  }
  for (const html of pageHtml) {
    const downloads = [...html.matchAll(/href="([^"]*UOAssetStudio-Setup-[^"]+\.exe)"/g)].map(match => match[1]);
    if (!downloads.length || downloads.some(url => url !== installerUrl)) throw Error('Studio page installer links must match the update metadata.');
  }
  return {
    schema_version: 1,
    app_id: 'uo-asset-studio',
    version: value.version,
    release_notes_url: value.release_notes_url,
    installer: { url: installerUrl, sha256: value.installer.sha256, size: value.installer.size }
  };
}

export async function buildStudioRelease() {
  const metadata = JSON.parse(await readFile(resolve(root, 'data/studio-release.json'), 'utf8'));
  const { releases } = JSON.parse(await readFile(resolve(root, 'data/studio-updates.json'), 'utf8'));
  const pages = await Promise.all(currentPages.map(page => readFile(resolve(root, 'public', page), 'utf8')));
  const manifest = validateStudioRelease(metadata, releases, pages);
  await mkdir(resolve(root, 'public/studio'), { recursive: true });
  await writeFile(resolve(root, 'public/studio/update.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Built Studio updater metadata: ${manifest.version}, ${manifest.installer.size} verified installer bytes.`);
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildStudioRelease();
