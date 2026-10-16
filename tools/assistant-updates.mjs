// Validate the application-signed Assistant feed before it reaches the website.
// This public key verifies releases; it cannot sign or authorize a new release.
import { createHash, createPublicKey, constants, verify } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const assistantFeedKeyId = '9DA0665A2F2FCE0751C33F75D6DB5549A0DBE15F36B824624CA705A964B47220';
export const assistantFeedPublicKey = `-----BEGIN PUBLIC KEY-----
MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEA1ZhssCDjQc5hOs8Z5KI3
o1RbkL7VeEzaodGN6Evm9FgSQR0dq4e3EUVw6+VDY+W41VZbScIvSpZCqID+hosx
AXyqVDIetzfACTOP0yge1MfaR1oVAccCJReXCsdFfXPc3sbj4bSX67/LclMh1X2g
wEIJqPvr4jGouYvj2ol+Rq175xqIfpg3i+2rMPt5OmW0swKLD82mxY8BhffC4401
CE42fh+5g/q2I6cABB35kRxQqMlPxLlxlLCKdIkrpg3SuFFP4poGHe/cu867xAFA
oP0vm7wDvYOrLVLoC2IjF0gDoMaEkmGxqQDHEy2YfIeXfNBzZju9mfSmDPww0Z31
NOMzH80a8+aBCaHQziWrEy57whwX3bjch2xpLQZS58VBId/13H2O6UexiSiRsw/E
45OVm1v8530rDl4ZAP4F22dZHoa5PHm8UPzwoKNy0PKHfqLXqxEcziZ3UUlPdIw3
+G5VhgVBuZeSCM4XwAjZfv7ittZp6ZLf6zZ/XqP6WPa9AgMBAAE=
-----END PUBLIC KEY-----`;
const hex = /^[a-fA-F0-9]{64}$/;
const version = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const maximumFeedBytes = 524288;

function expect(condition, message) { if (!condition) throw Error(message); }
function boundedJson(bytes) {
  // Keep a BOM visible so JSON.parse refuses it as the application's byte
  // reader does; malformed UTF-8 must never become replacement characters.
  const value = JSON.parse(new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes));
  const pending = [[value, 1]];
  while (pending.length) {
    const [item, depth] = pending.pop();
    if (item !== null && typeof item === 'object') {
      expect(depth <= 16, 'Assistant JSON exceeds the application depth limit');
      for (const nested of Object.values(item)) pending.push([nested, depth + 1]);
    }
  }
  return value;
}
function issuedUtc(text) {
  expect(typeof text === 'string', 'Invalid Assistant UTC date type');
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,7})?(?:Z|\+00:00)$/.exec(text);
  expect(match, 'Assistant issue date must use the generated UTC ISO format');
  const stamp = Date.parse(text), date = new Date(stamp);
  expect(Number.isFinite(stamp) && Number(match[1]) >= 1 &&
    date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() + 1 === Number(match[2]) && date.getUTCDate() === Number(match[3]) &&
    date.getUTCHours() === Number(match[4]) && date.getUTCMinutes() === Number(match[5]) && date.getUTCSeconds() === Number(match[6]), 'Invalid Assistant UTC calendar date');
  return stamp;
}
function base64(value, maximum) {
  expect(typeof value === 'string' && value.length > 0 && value.length <= maximum, 'Invalid Assistant signature field');
  const bytes = Buffer.from(value, 'base64');
  expect(bytes.toString('base64') === value, 'Invalid Assistant signature encoding');
  return bytes;
}
export function validateAssistantRelease(release) {
  expect(release && typeof release.Version === 'string' && version.test(release.Version) && typeof release.File === 'string' && release.File === `UOAssistant-${release.Version}-Setup.exe`, 'Invalid Assistant release version or file');
  expect(Number.isSafeInteger(release.Bytes) && release.Bytes >= 1024 && release.Bytes <= 536870912, 'Invalid Assistant installer size');
  expect(typeof release.Sha256 === 'string' && typeof release.ClientFileSetSha256 === 'string' && hex.test(release.Sha256) && hex.test(release.ClientFileSetSha256), 'Invalid Assistant release hashes');
  expect(typeof release.Notes === 'string' && release.Notes.length <= 8192 && !/[\u0000-\u0008\u000B\u000C\u000E-\u001f\u007f-\u009f]/.test(release.Notes), 'Invalid Assistant release notes');
  const expected = `https://github.com/Celobra/uo-asset-downloads/releases/download/uo-assistant-v${release.Version}/${release.File}`;
  expect(typeof release.DownloadUrl === 'string' && release.DownloadUrl === expected, 'Assistant installer must use the exact verified GitHub release asset');
  return release;
}
export function verifyAssistantFeed(bytes, {publicKey = assistantFeedPublicKey, keyId = assistantFeedKeyId, now = Date.now()} = {}) {
  expect(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= maximumFeedBytes, 'Assistant feed exceeds its size limit');
  const envelope = boundedJson(bytes);
  expect(envelope?.Schema === 1 && envelope.KeyId === keyId, 'Unknown Assistant release key or envelope schema');
  const payload = base64(envelope.Payload, 400000), signature = base64(envelope.Signature, 2048);
  expect(verify('sha256', payload, {key: publicKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32}, signature), 'Assistant release signature mismatch');
  const catalog = boundedJson(payload);
  const issued = issuedUtc(catalog.IssuedUtc);
  expect(catalog.Schema === 1 && catalog.Product === 'UO Assistant' && Number.isFinite(issued) && issued <= now + 86400000, 'Invalid Assistant catalog product, schema or date');
  expect(Array.isArray(catalog.Releases) && catalog.Releases.length > 0 && catalog.Releases.length <= 32, 'Invalid Assistant release list');
  const seen = new Set();
  for (const release of catalog.Releases) {
    validateAssistantRelease(release);
    expect(!seen.has(release.Version), 'Duplicate Assistant release version');
    seen.add(release.Version);
  }
  return catalog;
}
export function assistantPublicKeyDigest(publicKey = assistantFeedPublicKey) {
  return createHash('sha256').update(createPublicKey(publicKey).export({type: 'spki', format: 'der'})).digest('hex').toUpperCase();
}
export async function validatePublishedAssistantFeed(root) {
  const bytes = await readFile(resolve(root, 'public/assistant/update.json'));
  const catalog = verifyAssistantFeed(bytes);
  const metadata = JSON.parse(await readFile(resolve(root, 'data/assistant-release.json'), 'utf8'));
  const release = catalog.Releases.find(item => item.Version === metadata.version);
  expect(release, 'The Assistant website version is absent from its signed feed');
  expect(metadata.downloads.installer === release.DownloadUrl, 'Assistant website download differs from the signed release');
  const artifact = metadata.artifacts[release.File];
  expect(artifact?.bytes === release.Bytes && artifact?.sha256?.toLowerCase() === release.Sha256.toLowerCase(), 'Assistant website installer identity differs from the signed release');
  return {version: release.Version, releases: catalog.Releases.length, bytes: release.Bytes};
}
