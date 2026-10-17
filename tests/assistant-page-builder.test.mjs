import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderAssistantPage } from '../tools/build-assistant.mjs';
const template = await readFile(new URL('../data/assistant-page.html', import.meta.url), 'utf8');
function syntheticMetadata() {
  const version = '0.5.0', prefix = `https://github.com/Celobra/uo-asset-downloads/releases/download/uo-assistant-v${version}/`;
  const names = {installer: `UOAssistant-${version}-Setup.exe`, source: `UOAssistant-${version}-Source.zip`, guide: `UOAssistant-${version}-Guide.zip`, rebuildKit: `UOAssistant-${version}-MP3Sharp-Source-Rebuild.zip`, checksums: `SHA256SUMS-${version}.txt`};
  return {version, gameDataIncluded: false, privateProfilesIncluded: false, automaticLogin: false,
    downloads: {...Object.fromEntries(Object.entries(names).map(([name, file]) => [name, prefix + file])),
      recordingTools: prefix + 'Recording-Tools.zip', ffmpegSource: prefix + 'FFmpeg-Source.zip', ffmpegDependencies: [prefix + 'FFmpeg-Dependencies.zip'], recordingNotices: 'https://www.uoassets.com/assistant/guide/Third-Party-Notices.html'},
    artifacts: Object.fromEntries(Object.values(names).map(name => [name, {bytes: 1234, sha256: 'a'.repeat(64)}])),
    producerChecks: {integrated: 1000, launcherCoreNetwork: 111}, previousReleases: []};
}
test('Assistant template renders only exact versioned and verified artifact identities', () => {
  const html = renderAssistantPage(template, syntheticMetadata());
  assert.ok(html.includes('UO Assistant 0.5.0')); assert.ok(html.includes('1,234 bytes'));
  assert.ok(html.includes('a'.repeat(64))); assert.ok(html.includes('1,000 isolated application checks'));
  assert.doesNotMatch(html, /\{\{|<style\b|\sstyle=|<script\b/i);
});
test('Assistant build refuses unverified private or mismatched release inputs', () => {
  for (const mutate of [m => {m.version = '0.2.1';}, m => {m.gameDataIncluded = true;}, m => {m.downloads.installer += '?other';},
    m => {delete m.artifacts['UOAssistant-0.5.0-Setup.exe'];}, m => {delete m.artifacts['UOAssistant-0.5.0-Source.zip'];},
    m => {m.artifacts['UOAssistant-0.5.0-Setup.exe'].sha256 = 'pending';}, m => {delete m.downloads.ffmpegSource;},
    m => {m.downloads.ffmpegDependencies = [];}, m => {m.downloads.recordingTools = 'javascript:alert(1)';}]) {
    const metadata = syntheticMetadata(); mutate(metadata); assert.throws(() => renderAssistantPage(template, metadata));
  }
});
test('Assistant page retains older releases and explicit synthetic and compatibility limits', () => {
  const metadata = syntheticMetadata(), prefix = 'https://github.com/Celobra/uo-asset-downloads/releases/download/uo-assistant-v0.2.1/';
  metadata.previousReleases = [{version: '0.2.1', downloads: {installer: prefix + 'UOAssistant-0.2.1-Setup.exe', source: prefix + 'UOAssistant-0.2.1-Source.zip', guide: prefix + 'UOAssistant-0.2.1-Guide.zip'}}];
  const html = renderAssistantPage(template, metadata);
  assert.ok(html.includes(prefix + 'UOAssistant-0.2.1-Setup.exe'));
  for (const required of ['Unsigned development preview', 'synthetic test', 'not live walking', 'NVIDIA hardware was tested', '32 of 200 scripts fully', 'LGPL version 3', 'not a server acknowledgement', 'Closing the assistant closes its paired game']) assert.ok(html.includes(required), required);
  assert.doesNotMatch(html, /C:[/\\]Users|G:[/\\]My Drive|Documents[/\\]ChatGPT|Regisfall/i);
});
