import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import vm from 'node:vm';

const source = await readFile(new URL('../public/gallery/download-archive.js', import.meta.url), 'utf8');
const loadArchive = (withWindow = true) => {
  const context = { Blob, TextEncoder, setTimeout };
  if (withWindow) context.window = {};
  vm.runInNewContext(source, context);
  return withWindow ? context.window.GALLERY_ARCHIVE : context.GALLERY_ARCHIVE;
};
const archive = loadArchive();
const crc32 = bytes => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

// Parse independently from the writer, checking both directories and payloads.
async function parseZip(blob) {
  assert.ok(blob instanceof Blob);
  assert.equal(blob.type, 'application/zip');
  const bytes = Buffer.from(await blob.arrayBuffer());
  const end = bytes.length - 22;
  assert.equal(bytes.readUInt32LE(end), 0x06054b50);
  assert.equal(bytes.readUInt16LE(end + 4), 0);
  assert.equal(bytes.readUInt16LE(end + 6), 0);
  const count = bytes.readUInt16LE(end + 10);
  assert.equal(bytes.readUInt16LE(end + 8), count);
  assert.equal(bytes.readUInt16LE(end + 20), 0);
  const centralSize = bytes.readUInt32LE(end + 12), centralOffset = bytes.readUInt32LE(end + 16);
  assert.equal(centralOffset + centralSize, end);
  const entries = [];
  let cursor = centralOffset, nextLocal = 0;
  for (let index = 0; index < count; index += 1) {
    assert.equal(bytes.readUInt32LE(cursor), 0x02014b50);
    assert.equal(bytes.readUInt16LE(cursor + 4), 20);
    assert.equal(bytes.readUInt16LE(cursor + 6), 20);
    assert.equal(bytes.readUInt16LE(cursor + 8), 0x0800, 'UTF-8 names, no descriptor or encryption flags');
    assert.equal(bytes.readUInt16LE(cursor + 10), 0, 'Packages must be stored without recompression');
    assert.equal(bytes.readUInt16LE(cursor + 12), 0);
    assert.equal(bytes.readUInt16LE(cursor + 14), 0x0021, 'A valid, deterministic DOS date');
    const crc = bytes.readUInt32LE(cursor + 16), size = bytes.readUInt32LE(cursor + 24);
    assert.equal(bytes.readUInt32LE(cursor + 20), size);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    assert.equal(bytes.readUInt16LE(cursor + 30), 0);
    assert.equal(bytes.readUInt16LE(cursor + 32), 0);
    assert.equal(bytes.readUInt16LE(cursor + 34), 0);
    const local = bytes.readUInt32LE(cursor + 42);
    assert.equal(local, nextLocal, 'Each central entry must point to its own local header');
    const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = new TextDecoder('utf-8', { fatal: true }).decode(nameBytes);
    assert.equal(bytes.readUInt32LE(local), 0x04034b50);
    assert.equal(bytes.readUInt16LE(local + 4), 20);
    assert.equal(bytes.readUInt16LE(local + 6), 0x0800);
    assert.equal(bytes.readUInt16LE(local + 8), 0);
    assert.equal(bytes.readUInt16LE(local + 10), 0);
    assert.equal(bytes.readUInt16LE(local + 12), 0x0021);
    assert.equal(bytes.readUInt32LE(local + 14), crc);
    assert.equal(bytes.readUInt32LE(local + 18), size);
    assert.equal(bytes.readUInt32LE(local + 22), size);
    assert.equal(bytes.readUInt16LE(local + 26), nameLength);
    assert.equal(bytes.readUInt16LE(local + 28), 0);
    assert.deepEqual(bytes.subarray(local + 30, local + 30 + nameLength), nameBytes);
    const payloadStart = local + 30 + nameLength;
    const payload = bytes.subarray(payloadStart, payloadStart + size);
    assert.equal(payload.length, size);
    assert.equal(crc32(payload), crc, 'Each complete payload needs its own CRC32');
    entries.push({ name, nameLength, payload, crc });
    nextLocal = payloadStart + size;
    cursor += 46 + nameLength;
  }
  assert.equal(nextLocal, centralOffset);
  assert.equal(cursor, end);
  return { bytes, entries };
}

test('Classic ZIP headers, offsets, UTF-8 names and CRCs describe unchanged native ZIP and arbitrary Blob bytes', async () => {
  // A real deflated package produced by Python's standard zipfile writer.
  const native = Buffer.from('UEsDBBQAAAAIAAAASF3GWgrQGgAAAFQAAAAKAAAAUkVBRE1FLnR4dPNLLMksS1VILC5OLVEoSEzOTkxP5fKjTBAAUEsBAhQAFAAAAAgAAABIXcZaCtAaAAAAVAAAAAoAAAAAAAAAAAAAAIABAAAAAFJFQURNRS50eHRQSwUGAAAAAAEAAQA4AAAAQgAAAAAA', 'base64');
  assert.equal(native.readUInt16LE(8), 8);
  const nativeStart = 30 + native.readUInt16LE(26) + native.readUInt16LE(28);
  assert.equal(inflateRawSync(native.subarray(nativeStart, nativeStart + native.readUInt32LE(18))).toString(), 'Native asset package\n'.repeat(4));
  const inputs = [
    { name: 'creatures/native-package.zip', blob: new Blob([native]) },
    { name: 'notes/使用说明-😀.txt', blob: new Blob(['Names and bytes remain intact.\r\n']) },
    { name: 'known-crc.txt', blob: new Blob(['123456789']) },
    { name: 'binary.dat', blob: new Blob([Uint8Array.from([0, 1, 127, 128, 254, 255])]) },
    { name: 'empty.dat', blob: new Blob([]) },
  ];
  const { entries } = await parseZip(await archive.create(inputs));
  assert.deepEqual(entries.map(entry => entry.name), inputs.map(entry => entry.name));
  for (let index = 0; index < inputs.length; index += 1) assert.deepEqual(entries[index].payload, Buffer.from(await inputs[index].blob.arrayBuffer()));
  assert.ok(entries[1].nameLength > inputs[1].name.length);
  assert.equal(entries[2].crc, 0xcbf43926);
  assert.equal(entries[4].crc, 0);
});

test('The DOM-free utility works on globalThis, emits a valid empty ZIP and produces deterministic output', async () => {
  assert.equal(typeof loadArchive(false).create, 'function');
  assert.ok(Object.isFrozen(archive));
  const empty = await parseZip(await archive.create([]));
  assert.equal(empty.bytes.length, 22);
  assert.equal(empty.entries.length, 0);
  const input = [{ name: 'one.zip', blob: new Blob([Uint8Array.from([80, 75, 0, 255])]) }];
  assert.deepEqual((await parseZip(await archive.create(input))).bytes, (await parseZip(await archive.create(input))).bytes);
});

class ReadSpyBlob extends Blob {
  reads = 0;
  slice(...args) { this.reads += 1; return super.slice(...args); }
}

test('Unsafe, duplicate and extraction-conflicting paths fail before any package is read', async () => {
  const blob = new ReadSpyBlob(['payload']);
  for (const name of ['', '/absolute.zip', '../private.zip', 'a/../private.zip', './relative.zip', 'a//b.zip', 'a\\b.zip', 'C:relative.zip', 'https://example.test/a.zip', 'folder/', 'null\0byte.zip', 'line\nfeed.zip', 'bad?name.zip', 'trailing. /file.zip', 'NUL.zip', 'a/COM1.dat', 'unpaired-\uD800.zip']) {
    await assert.rejects(archive.create([{ name, blob }]), /safe relative file paths/, name);
  }
  for (const names of [['same.zip', 'same.zip'], ['SAME.zip', 'same.zip'], ['café.zip', 'cafe\u0301.zip']]) {
    await assert.rejects(archive.create(names.map(name => ({ name, blob }))), /Duplicate/, names.join(', '));
  }
  for (const names of [['folder', 'folder/file.zip'], ['folder/file.zip', 'folder']]) {
    await assert.rejects(archive.create(names.map(name => ({ name, blob }))), /Conflicting/);
  }
  await assert.rejects(archive.create([{ name: 123, blob }]), /safe relative/);
  await assert.rejects(archive.create([{ name: 'one.zip', blob: { size: 1 } }]), /Blob/);
  await assert.rejects(archive.create(null), /array/);
  assert.equal(blob.reads, 0);
});

test('Classic ZIP count, UTF-8 filename, entry size and projected archive offsets are checked before reads', async () => {
  const blob = new ReadSpyBlob(['payload']);
  await assert.rejects(archive.create(new Array(0xffff).fill({ name: 'one.zip', blob })), /Too many entries/);
  await assert.rejects(archive.create([{ name: 'é'.repeat(32768), blob }]), /name is too long/);
  await assert.rejects(archive.create([{ name: 'a'.repeat(65536), blob }]), /name is too long/);
  class SizedBlob extends ReadSpyBlob {
    constructor(reportedSize) { super([]); this.reportedSize = reportedSize; }
    get size() { return this.reportedSize; }
  }
  for (const size of [-1, 1.5, NaN, Infinity, '1', Number.MAX_SAFE_INTEGER, 0xffffffff]) {
    const oversized = new SizedBlob(size);
    await assert.rejects(archive.create([{ name: 'oversized.zip', blob: oversized }]), /classic ZIP size/);
    assert.equal(oversized.reads, 0);
  }
  const nearLimit = new SizedBlob(0xfffffffe);
  await assert.rejects(archive.create([{ name: 'near-limit.zip', blob: nearLimit }]), /size or offset/);
  assert.equal(nearLimit.reads, 0, 'Header/directory overhead must be included before reading');
  const first = new SizedBlob(0x80000000), second = new SizedBlob(0x80000000);
  await assert.rejects(archive.create([{ name: 'first.zip', blob: first }, { name: 'second.zip', blob: second }]), /size or offset/);
  assert.equal(first.reads + second.reads + blob.reads, 0);
});

test('Progress is monotonic across CRC chunks and empty packages, while input metadata is snapshotted', async () => {
  const blob = new ReadSpyBlob([new Uint8Array(1024 * 1024 + 3)]);
  const inputs = [{ name: 'large.zip', blob }, { name: 'empty.zip', blob: new Blob([]) }];
  const events = [];
  const result = await archive.create(inputs, { onProgress: progress => {
    events.push(progress);
    if (events.length === 1) inputs[0] = { name: '../changed.zip', blob: new Blob(['changed']) };
  } });
  assert.equal(blob.reads, 2, 'CRC reads must be bounded chunks rather than one large allocation');
  assert.equal(events[0].completed, 0);
  assert.equal(events[0].bytesRead, 0);
  assert.ok(events.some(event => event.bytesRead > 0 && event.completed === 0));
  for (let index = 1; index < events.length; index += 1) {
    assert.ok(events[index].completed >= events[index - 1].completed);
    assert.ok(events[index].bytesRead >= events[index - 1].bytesRead);
    assert.equal(events[index].total, 2);
    assert.equal(events[index].totalBytes, blob.size);
  }
  assert.equal(events.at(-1).completed, 2);
  assert.equal(events.at(-1).bytesRead, blob.size);
  assert.equal(events.at(-1).name, 'empty.zip');
  const parsed = await parseZip(result);
  assert.deepEqual(parsed.entries.map(entry => entry.name), ['large.zip', 'empty.zip']);
});

test('Abort before work and from initial progress performs no reads and rejects with AbortError', async () => {
  const blob = new ReadSpyBlob(['payload']);
  const already = new AbortController(); already.abort('cancelled');
  await assert.rejects(archive.create([{ name: 'one.zip', blob }], { signal: already.signal }), { name: 'AbortError' });
  const controller = new AbortController();
  await assert.rejects(archive.create([{ name: 'one.zip', blob }], { signal: controller.signal, onProgress: () => controller.abort() }), { name: 'AbortError' });
  assert.equal(blob.reads, 0);
});

test('Cancellation gets event-loop time during CRC and stops before another chunk or package is read', async () => {
  const controller = new AbortController();
  const blob = new ReadSpyBlob([new Uint8Array(3 * 1024 * 1024)]), later = new ReadSpyBlob(['later']);
  const events = [];
  await assert.rejects(archive.create([{ name: 'large.zip', blob }, { name: 'later.zip', blob: later }], {
    signal: controller.signal,
    onProgress: progress => {
      events.push(progress);
      if (progress.bytesRead > 0) setTimeout(() => controller.abort(), 0);
    },
  }), { name: 'AbortError' });
  assert.equal(blob.reads, 1);
  assert.equal(later.reads, 0);
  assert.equal(events.at(-1).completed, 0);
  const completed = new AbortController();
  await assert.rejects(archive.create([{ name: 'small.zip', blob: new Blob(['small']) }], {
    signal: completed.signal, onProgress: progress => { if (progress.completed === 1) completed.abort(); },
  }), { name: 'AbortError' }, 'Abort after the final CRC must not return a partial or unwanted archive');
});

test('A failed Blob read or progress handler rejects rather than producing a damaged archive', async () => {
  class BrokenBlob extends Blob { slice() { return { arrayBuffer: async () => { throw new Error('Read failed'); } }; } }
  await assert.rejects(archive.create([{ name: 'broken.zip', blob: new BrokenBlob(['payload']) }]), /Read failed/);
  class ShortBlob extends Blob { slice() { return new Blob([]); } }
  await assert.rejects(archive.create([{ name: 'short.zip', blob: new ShortBlob(['payload']) }]), /size changed/);
  const blob = new ReadSpyBlob(['payload']);
  await assert.rejects(archive.create([{ name: 'one.zip', blob }], { onProgress: () => { throw new Error('Progress failed'); } }), /Progress failed/);
  assert.equal(blob.reads, 0);
  await assert.rejects(archive.create([], { signal: {} }), /AbortSignal/);
  await assert.rejects(archive.create([], { onProgress: 'invalid' }), /progress handler/);
});
