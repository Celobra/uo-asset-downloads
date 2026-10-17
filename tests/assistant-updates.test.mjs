import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, constants } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assistantFeedKeyId, assistantPublicKeyDigest, verifyAssistantFeed, validateAssistantRelease, validatePublishedAssistantFeed } from '../tools/assistant-updates.mjs';

const {publicKey, privateKey} = generateKeyPairSync('rsa', {modulusLength: 2048});
const keyId = 'owned-test-key';
const release = {
  Version: '0.2.1', File: 'UOAssistant-0.2.1-Setup.exe', Bytes: 118623640,
  Sha256: 'A'.repeat(64), ClientFileSetSha256: 'B'.repeat(64), Notes: 'Owned synthetic fixture.',
  DownloadUrl: 'https://github.com/Celobra/uo-asset-downloads/releases/download/uo-assistant-v0.2.1/UOAssistant-0.2.1-Setup.exe'
};
function signed(overrides = {}) {
  const payload = Buffer.from(JSON.stringify({Schema: 1, Product: 'UO Assistant', IssuedUtc: '2026-10-16T00:00:00Z', Releases: [release], ...overrides}));
  return Buffer.from(JSON.stringify({Schema: 1, KeyId: keyId, Payload: payload.toString('base64'), Signature: sign('sha256', payload, {key: privateKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32}).toString('base64')}));
}
const trust = {publicKey, keyId, now: Date.parse('2026-10-16T12:00:00Z')};

test('Assistant release trust key matches the application public-key digest', () => {
  assert.equal(assistantPublicKeyDigest(), assistantFeedKeyId);
});
test('An intact RSA-PSS signed Assistant fixture verifies without changing its payload', () => {
  const catalog = verifyAssistantFeed(signed(), trust);
  assert.deepEqual(catalog.Releases, [release]);
});
test('Payload tampering and an untrusted signing key are rejected', () => {
  const envelope = JSON.parse(signed());
  envelope.Payload = Buffer.from(Buffer.from(envelope.Payload, 'base64').toString('utf8').replace('118623640', '118623641')).toString('base64');
  assert.throws(() => verifyAssistantFeed(Buffer.from(JSON.stringify(envelope)), trust), /signature mismatch/);
  assert.throws(() => verifyAssistantFeed(signed()), /Unknown Assistant release key/);
});
test('Invalid product, duplicate versions and future catalog dates are rejected', () => {
  for (const change of [{Product: 'UO Asset Studio'}, {Releases: [release, release]}, {IssuedUtc: '2030-01-01T00:00:00Z'}]) {
    assert.throws(() => verifyAssistantFeed(signed(change), trust));
  }
});
test('Signed malformed historical releases cannot bypass the application string contract', () => {
  const earlier = {...release, Version: '0.2.0', File: 'UOAssistant-0.2.0-Setup.exe', DownloadUrl: 'https://github.com/Celobra/uo-asset-downloads/releases/download/uo-assistant-v0.2.0/UOAssistant-0.2.0-Setup.exe'};
  for (const change of [{Version: ['0.2.0']}, {Sha256: ['A'.repeat(64)]}, {ClientFileSetSha256: ['B'.repeat(64)]}]) {
    assert.throws(() => verifyAssistantFeed(signed({Releases: [release, {...earlier, ...change}]}), trust));
  }
});
test('Issue dates require scalar UTC ISO values and actual calendar days', () => {
  for (const IssuedUtc of [['2026-10-16T00:00:00Z'], 'October 16 2026', '2026-02-30T00:00:00Z', '2026-10-16T24:00:00Z', '2026-10-16T00:00:60Z']) {
    assert.throws(() => verifyAssistantFeed(signed({IssuedUtc}), trust));
  }
  assert.equal(verifyAssistantFeed(signed({IssuedUtc: '2026-10-16T00:00:00.1234567+00:00'}), trust).Product, 'UO Assistant');
});
test('Extra signed JSON cannot exceed the application depth limit', () => {
  let extra = {};
  for (let depth = 0; depth < 17; depth++) extra = {nested: extra};
  assert.throws(() => verifyAssistantFeed(signed({extra}), trust), /depth limit/);
});
test('Malformed UTF-8 is refused in both the envelope and an intactly signed payload', () => {
  const valid = signed();
  const invalidEnvelope = Buffer.concat([valid.subarray(0, -1), Buffer.from(',"Extra":"'), Buffer.from([0xff]), Buffer.from('"}')]);
  assert.throws(() => verifyAssistantFeed(invalidEnvelope, trust));
  const envelope = JSON.parse(valid), originalPayload = Buffer.from(envelope.Payload, 'base64');
  const marker = Buffer.from('Owned synthetic fixture.');
  const offset = originalPayload.indexOf(marker);
  assert.ok(offset > 0);
  const payload = Buffer.concat([originalPayload.subarray(0, offset), Buffer.from([0xff]), originalPayload.subarray(offset + 1)]);
  envelope.Payload = payload.toString('base64');
  envelope.Signature = sign('sha256', payload, {key: privateKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32}).toString('base64');
  assert.throws(() => verifyAssistantFeed(Buffer.from(JSON.stringify(envelope)), trust));
  assert.throws(() => verifyAssistantFeed(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), valid]), trust));
});
test('Unsafe installer addresses, traversal, alternate repositories and altered version paths fail', () => {
  const urls = [release.DownloadUrl.replace('https:', 'http:'), release.DownloadUrl.replace('Celobra/', 'AnotherOwner/'), release.DownloadUrl + '?token=test', release.DownloadUrl + '#fragment', release.DownloadUrl.replace('v0.2.1/', 'v0.2.0/'), 'https://example.invalid/UOAssistant-0.2.1-Setup.exe'];
  for (const DownloadUrl of urls) assert.throws(() => validateAssistantRelease({...release, DownloadUrl}));
  assert.throws(() => validateAssistantRelease({...release, File: '../UOAssistant-0.2.1-Setup.exe'}));
});
test('Release byte limits, checksum syntax and control characters are checked', () => {
  for (const change of [{Bytes: 536870913}, {Bytes: -1}, {Bytes: 12.5}, {Sha256: 'not-a-sha'}, {Notes: 'bad\u0000note'}]) {
    assert.throws(() => validateAssistantRelease({...release, ...change}));
  }
});
test('Feed bounds and malformed envelope encodings fail before a release is accepted', () => {
  for (const bytes of [Buffer.alloc(0), Buffer.alloc(524289), Buffer.from('{"Schema":1,"KeyId":"owned-test-key","Payload":"%%%","Signature":"AAAA"}')]) {
    assert.throws(() => verifyAssistantFeed(bytes, trust));
  }
});
test('Assistant feed headers persist in both the source generator and deployed header file', async () => {
  for (const name of ['../tools/build.mjs', '../public/_headers']) {
    const text = await readFile(fileURLToPath(new URL(name, import.meta.url)), 'utf8');
    assert.match(text, /\/assistant\/update\.json\r?\n  Cache-Control: no-cache, no-store, must-revalidate\r?\n  Content-Type: application\/json; charset=utf-8/);
    assert.match(text, /\/studio\/update\.json\r?\n  Cache-Control: no-cache, no-store, must-revalidate/);
  }
});
test('The published Assistant feed verifies and identifies the website installer exactly', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const release = await validatePublishedAssistantFeed(root);
  assert.equal(release.version, '0.6.0');
  assert.equal(release.bytes, 192245466);
  assert.ok(release.releases >= 6);
});
