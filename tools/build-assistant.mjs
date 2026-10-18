import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const checkout = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const hash = /^[a-f0-9]{64}$/i;
function expect(condition, message) { if (!condition) throw Error(message); }
function releaseUrl(value, version, file) {
  const exact = `https://github.com/Celobra/uo-asset-downloads/releases/download/uo-assistant-v${version}/${file}`;
  expect(value === exact, `Assistant ${file} must use its exact versioned download`);
  return exact;
}
function artifact(metadata, file) {
  const value = metadata.artifacts?.[file];
  expect(value && Number.isSafeInteger(value.bytes) && value.bytes > 0 && hash.test(value.sha256), `Missing verified Assistant artifact: ${file}`);
  return value;
}
function optionalDownload(value, label) {
  if (!value) return '';
  expect(typeof value === 'string' && /^https:\/\/(?:github\.com\/Celobra\/uo-asset-downloads\/releases\/download\/|www\.uoassets\.com\/assistant\/)/.test(value), 'Invalid Assistant dependency download');
  return `<p><a href="${escape(value)}">${escape(label)} ↓</a></p>`;
}
export function renderAssistantPage(template, metadata) {
  expect(/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(metadata.version), 'Invalid Assistant website version');
  expect(Number(metadata.version.split('.')[1]) >= 3 || Number(metadata.version.split('.')[0]) > 0, 'This Assistant page describes 0.3.0 or later');
  expect(metadata.gameDataIncluded === false && metadata.privateProfilesIncluded === false && metadata.automaticLogin === false, 'Assistant public release privacy contract is incomplete');
  const v = metadata.version, downloads = metadata.downloads ?? {};
  const installerFile = `UOAssistant-${v}-Setup.exe`, installer = artifact(metadata, installerFile);
  for (const file of [`UOAssistant-${v}-Source.zip`, `UOAssistant-${v}-Guide.zip`, `UOAssistant-${v}-MP3Sharp-Source-Rebuild.zip`]) artifact(metadata, file);
  expect(typeof downloads.recordingTools === 'string' && typeof downloads.ffmpegSource === 'string'
    && Array.isArray(downloads.ffmpegDependencies) && downloads.ffmpegDependencies.length > 0 && downloads.ffmpegDependencies.length <= 8
    && typeof downloads.recordingNotices === 'string', 'The recording tools, notices and matching source/rebuild downloads are required');
  const replacements = {
    VERSION: v,
    INSTALLER_URL: releaseUrl(downloads.installer, v, installerFile),
    SOURCE_URL: releaseUrl(downloads.source, v, `UOAssistant-${v}-Source.zip`),
    GUIDE_URL: releaseUrl(downloads.guide, v, `UOAssistant-${v}-Guide.zip`),
    REBUILD_URL: releaseUrl(downloads.rebuildKit, v, `UOAssistant-${v}-MP3Sharp-Source-Rebuild.zip`),
    CHECKSUM_URL: releaseUrl(downloads.checksums, v, `SHA256SUMS-${v}.txt`),
    RELEASE_URL: `https://github.com/Celobra/uo-asset-downloads/releases/tag/uo-assistant-v${v}`,
    INSTALLER_BYTES: installer.bytes.toLocaleString('en-GB'), INSTALLER_SHA256: installer.sha256.toLowerCase(),
  };
  let html = template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, name) => {
    expect(Object.hasOwn(replacements, name), `Unknown Assistant template field: ${name}`);
    return escape(replacements[name]);
  });
  const dependencies = [optionalDownload(downloads.recordingTools, 'Original FFmpeg recording tools'),
    optionalDownload(downloads.ffmpegSource, 'FFmpeg source and rebuild kit'),
    ...(Array.isArray(downloads.ffmpegDependencies) ? downloads.ffmpegDependencies.map((url, i) => optionalDownload(url, `FFmpeg dependency source, part ${i + 1}`)) : []),
    optionalDownload(downloads.recordingNotices, 'Recording component notices')].join('\n');
  html = html.replace('<!-- RECORDING_DEPENDENCIES -->', dependencies);
  const older = (metadata.previousReleases ?? []).map(old => {
    expect(/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(old.version), 'Invalid earlier Assistant version');
    return `<p>Version ${escape(old.version)}: <a href="${escape(releaseUrl(old.downloads.installer, old.version, `UOAssistant-${old.version}-Setup.exe`))}">installer ↓</a> · <a href="${escape(releaseUrl(old.downloads.source, old.version, `UOAssistant-${old.version}-Source.zip`))}">source ↓</a> · <a href="${escape(releaseUrl(old.downloads.guide, old.version, `UOAssistant-${old.version}-Guide.zip`))}">guide ↓</a></p>`;
  }).join('\n');
  html = html.replace('<!-- EARLIER_RELEASES -->', older);
  const checks = metadata.producerChecks ?? {};
  const labels = [['integrated', 'isolated application checks'], ['companionInterface', 'synthetic assistant interface checks'], ['launcherCoreNetwork', 'launcher core/network checks'], ['launcherInterface', 'synthetic launcher interface checks'], ['installation', 'installation, preservation and removal checks']];
  const checked = labels.filter(([name]) => Number.isSafeInteger(checks[name]) && checks[name] > 0).map(([name, label]) => `${checks[name].toLocaleString('en-GB')} ${label}`);
  html = html.replace('<!-- VERIFIED_CHECKS -->', checked.length ? `<p>The verified release passed ${escape(checked.join('; '))}. Tests used owned files and synthetic fixtures. Final counts and package identities are retained in the release record.</p>` : '<p>The release record lists the completed application, installer and source verification checks.</p>');
  expect(!/\{\{|RECORDING_DEPENDENCIES|EARLIER_RELEASES|VERIFIED_CHECKS/.test(html), 'Unresolved Assistant website field');
  return html;
}
export function renderAssistantHome(html, metadata) {
  expect(/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(metadata.version), 'Invalid Assistant homepage version');
  const spotlight = `<!-- ASSISTANT_SPOTLIGHT_START -->
<aside class="assistant-home-strip" aria-label="UO Assistant ${escape(metadata.version)}"><a class="assistant-home-mark" href="/assistant/" aria-label="Explore UO Assistant"><img src="/assistant/media/uo-assistant-070.png" width="76" height="76" alt="UO Assistant compass emblem" loading="lazy"></a><div><span>UO ASSISTANT ${escape(metadata.version)} · WINDOWS PREVIEW</span><strong>Target the item. Choose the bag.</strong><p>Save loot and scavenger rules from examples in the game. More selectors help with vendors, equipment and maps, alongside named pet healing and custom command panels. The GPU game and assistant keep separate windows.</p></div><a class="assistant-home-link" href="/assistant/#target-setup">See the setup &amp; download →</a></aside>
<!-- ASSISTANT_SPOTLIGHT_END -->`;
  if (html.includes('<!-- ASSISTANT_SPOTLIGHT_START -->'))
    html = html.replace(/<!-- ASSISTANT_SPOTLIGHT_START -->[\s\S]*?<!-- ASSISTANT_SPOTLIGHT_END -->/, spotlight);
  else {
    expect(html.includes('<main id="library">'), 'Assistant homepage spotlight needs the existing library landmark');
    html = html.replace('<main id="library">', spotlight + '\n<main id="library">');
  }
  if (!html.includes('href="/assistant/promo.css"')) html = html.replace('</head>', '<link rel="stylesheet" href="/assistant/promo.css"></head>');
  return html.replace(/UO Assistant \d+\.\d+\.\d+(?= and Studio)/g, `UO Assistant ${metadata.version}`);
}
export async function buildAssistant(root = checkout) {
  const metadata = JSON.parse(await readFile(resolve(root, 'data/assistant-release.json'), 'utf8'));
  const template = await readFile(resolve(root, 'data/assistant-page.html'), 'utf8');
  const html = renderAssistantPage(template, metadata);
  await mkdir(resolve(root, 'public/assistant'), {recursive: true});
  await writeFile(resolve(root, 'public/assistant/index.html'), html);
  for (const page of ['public/index.html', 'public/gallery/index.html']) {
    const home = await readFile(resolve(root, page), 'utf8');
    await writeFile(resolve(root, page), renderAssistantHome(home, metadata));
  }
  return {version: metadata.version, bytes: Buffer.byteLength(html)};
}
