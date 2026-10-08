/* ZIP store writer: packages remain byte-for-byte intact inside the archive. */
(function (root) {
  'use strict';

  // Leave ZIP64 sentinel values unused; this writer emits classic ZIP only.
  const MAX_ENTRIES = 0xfffe;
  const MAX_BYTES = 0xfffffffe;
  const MAX_NAME_BYTES = 0xffff;
  const CHUNK_BYTES = 1024 * 1024;
  const UTF8 = 0x0800;
  const crcTable = new Uint32Array(256);
  for (let index = 0; index < crcTable.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    crcTable[index] = value >>> 0;
  }

  const checkAbort = signal => {
    if (!signal?.aborted) return;
    const error = new Error('Archive creation was cancelled.');
    error.name = 'AbortError';
    throw error;
  };
  const yieldControl = () => new Promise(resolve => setTimeout(resolve, 0));

  function prepare(entries) {
    if (!Array.isArray(entries)) throw new TypeError('Archive entries must be an array.');
    if (entries.length > MAX_ENTRIES) throw new RangeError('Too many entries for a classic ZIP archive.');
    const encoder = new TextEncoder();
    const names = new Set(), directories = new Set(), prepared = [];
    let offset = 0, centralSize = 0, totalBytes = 0;
    for (const entry of entries) {
      const name = entry?.name, blob = entry?.blob;
      if (typeof name !== 'string' || !name || name.startsWith('/') || /[\\\u0000-\u001f\u007f:<>"|?*]/.test(name) || /[\uD800-\uDFFF]/u.test(name)) {
        throw new TypeError('Archive entries need safe relative file paths.');
      }
      const segments = name.split('/');
      if (segments.some(segment => !segment || segment === '.' || segment === '..' || /[ .]$/.test(segment) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment))) {
        throw new TypeError('Archive entries need safe relative file paths.');
      }
      // Case and Unicode normalization prevent extraction collisions on Windows.
      const key = name.normalize('NFC').toLowerCase();
      if (names.has(key)) throw new TypeError('Duplicate archive entry name: ' + name);
      if (directories.has(key)) throw new TypeError('Conflicting archive file and directory paths: ' + name);
      const parentKeys = key.split('/').slice(0, -1).map((_, index, parts) => parts.slice(0, index + 1).join('/'));
      if (parentKeys.some(parent => names.has(parent))) throw new TypeError('Conflicting archive file and directory paths: ' + name);
      names.add(key);
      for (const parent of parentKeys) directories.add(parent);
      if (!(blob instanceof Blob)) throw new TypeError('Every archive entry must contain a Blob.');
      const size = blob.size;
      if (!Number.isSafeInteger(size) || size < 0 || size > MAX_BYTES) throw new RangeError('Entry exceeds the classic ZIP size limit.');
      const nameBytes = encoder.encode(name);
      if (nameBytes.length > MAX_NAME_BYTES) throw new RangeError('Archive entry name is too long for classic ZIP.');
      prepared.push({ name, nameBytes, blob, size, offset });
      offset += 30 + nameBytes.length + size;
      centralSize += 46 + nameBytes.length;
      totalBytes += size;
      if (offset > MAX_BYTES || centralSize > MAX_BYTES || offset + centralSize + 22 > MAX_BYTES) {
        throw new RangeError('Archive size or offset exceeds the classic ZIP limit.');
      }
    }
    return { entries: prepared, centralOffset: offset, centralSize, totalBytes };
  }

  async function checksum(entry, signal, onRead) {
    let crc = 0xffffffff;
    for (let start = 0; start < entry.size; start += CHUNK_BYTES) {
      checkAbort(signal);
      const end = Math.min(entry.size, start + CHUNK_BYTES);
      const bytes = new Uint8Array(await entry.blob.slice(start, end).arrayBuffer());
      checkAbort(signal);
      if (bytes.length !== end - start) throw new Error('Archive Blob size changed while reading.');
      for (let index = 0; index < bytes.length; index += 1) crc = crcTable[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
      onRead(bytes.length);
      await yieldControl();
      checkAbort(signal);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function localHeader(entry, crc) {
    const bytes = new Uint8Array(30 + entry.nameBytes.length), view = new DataView(bytes.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, UTF8, true);
    // Method 0, midnight, and 1 January 1980 make output deterministic.
    view.setUint16(12, 0x0021, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, entry.size, true);
    view.setUint32(22, entry.size, true);
    view.setUint16(26, entry.nameBytes.length, true);
    bytes.set(entry.nameBytes, 30);
    return bytes;
  }

  function centralHeader(entry, crc) {
    const bytes = new Uint8Array(46 + entry.nameBytes.length), view = new DataView(bytes.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, UTF8, true);
    view.setUint16(14, 0x0021, true);
    view.setUint32(16, crc, true);
    view.setUint32(20, entry.size, true);
    view.setUint32(24, entry.size, true);
    view.setUint16(28, entry.nameBytes.length, true);
    view.setUint32(42, entry.offset, true);
    bytes.set(entry.nameBytes, 46);
    return bytes;
  }

  async function create(entries, { signal, onProgress } = {}) {
    if (signal != null && typeof signal.aborted !== 'boolean') throw new TypeError('Archive signal must be an AbortSignal.');
    if (onProgress != null && typeof onProgress !== 'function') throw new TypeError('Archive progress handler must be a function.');
    checkAbort(signal);
    const plan = prepare(entries);
    const localParts = [], centralParts = [];
    let bytesRead = 0;
    const progress = (completed, name) => onProgress?.({ completed, total: plan.entries.length, bytesRead, totalBytes: plan.totalBytes, name });
    progress(0, '');
    checkAbort(signal);
    for (let index = 0; index < plan.entries.length; index += 1) {
      const entry = plan.entries[index];
      const crc = await checksum(entry, signal, length => { bytesRead += length; progress(index, entry.name); });
      checkAbort(signal);
      localParts.push(localHeader(entry, crc), entry.blob);
      centralParts.push(centralHeader(entry, crc));
      progress(index + 1, entry.name);
      await yieldControl();
      checkAbort(signal);
    }
    const end = new Uint8Array(22), view = new DataView(end.buffer);
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(8, plan.entries.length, true);
    view.setUint16(10, plan.entries.length, true);
    view.setUint32(12, plan.centralSize, true);
    view.setUint32(16, plan.centralOffset, true);
    return new Blob([...localParts, ...centralParts, end], { type: 'application/zip' });
  }

  root.GALLERY_ARCHIVE = Object.freeze({ create });
})(typeof window === 'undefined' ? globalThis : window);
