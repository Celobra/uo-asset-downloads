(function (root) {
  'use strict';
  const archivePrefix = '/gallery/downloads/';
  const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;
  const sizeLabel = bytes => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.ceil(bytes / 1024))} KB`;

  function plan(items, baseURI) {
    if (!items.length || items.length > 24) throw Error('Choose between 1 and 24 assets on this page.');
    const base = new URL(baseURI), packages = new Map();
    for (const item of items) {
      const download = item.download;
      if (!download) throw Error(`No game-file package is available for ${item.name}.`);
      const url = new URL(download.file, base);
      if (!/^https?:$/.test(url.protocol) || url.origin !== base.origin || !url.pathname.startsWith(archivePrefix) || url.search || url.hash) throw Error('This asset package is not available from the library.');
      const name = decodeURIComponent(url.pathname.slice(archivePrefix.length));
      if (!name.endsWith('.zip') || name.split('/').some(part => !part || part === '.' || part === '..') || /[\\\0]/.test(name)) throw Error('This asset package has an invalid filename.');
      if (!Number.isSafeInteger(download.sizeBytes) || download.sizeBytes < 1 || !/^[a-f0-9]{64}$/i.test(download.sha256)) throw Error('This asset package has incomplete download information.');
      const existing = packages.get(url.href);
      if (existing) {
        if (existing.sizeBytes !== download.sizeBytes || existing.sha256 !== download.sha256.toLowerCase()) throw Error('This shared asset package has inconsistent download information.');
        existing.assets.push(item.name);
      } else {
        packages.set(url.href, { url: url.href, name, label: item.name, sizeBytes: download.sizeBytes, sha256: download.sha256.toLowerCase(), assets: [item.name] });
      }
    }
    const list = [...packages.values()];
    return { assets: items.length, packages: list, totalBytes: list.reduce((sum, item) => sum + item.sizeBytes, 0) };
  }

  function aborted(signal) {
    if (signal?.aborted) throw new DOMException('Download cancelled', 'AbortError');
  }

  async function fetchPackages(downloadPlan, { signal, onProgress = () => {}, fetcher = root.fetch.bind(root), timeoutMs = 120000 } = {}) {
    const entries = [];
    for (const [index, item] of downloadPlan.packages.entries()) {
      aborted(signal);
      onProgress({ completed: index, total: downloadPlan.packages.length, name: item.label });
      const request = new AbortController();
      const cancel = () => request.abort();
      signal?.addEventListener('abort', cancel, { once: true });
      const timer = setTimeout(() => request.abort(), timeoutMs);
      try {
        const response = await fetcher(item.url, { signal: request.signal, credentials: 'same-origin' });
        if (!response.ok) throw Error('Download request failed');
        const blob = await response.blob();
        aborted(signal);
        if (blob.size !== item.sizeBytes) throw Error('Package size did not match');
        const digest = await root.crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
        aborted(signal);
        const sha256 = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
        if (sha256 !== item.sha256) throw Error('Package checksum did not match');
        entries.push({ name: item.name, blob });
      } catch (error) {
        aborted(signal);
        throw Error(`Could not download ${item.label}. Please try again.`, { cause: error });
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
      }
    }
    onProgress({ completed: entries.length, total: entries.length, name: '' });
    return entries;
  }

  root.GALLERY_BULK_DOWNLOADS = { plan, fetchPackages };
  if (typeof document === 'undefined') return;
  const el = id => document.getElementById(id);
  const bulkAvailable = /^https?:$/.test(new URL(document.baseURI).protocol) && !!root.crypto?.subtle && !!root.fetch;
  const selection = new Set();
  let pageItems = [], context = {}, pageKey = '', busy = false, job = null, revision = 0;
  let readyURL = '', readyTimer = null;
  const chosen = () => pageItems.filter(item => selection.has(item.id));

  function clearReady() {
    clearTimeout(readyTimer);
    if (readyURL) URL.revokeObjectURL(readyURL);
    readyURL = ''; readyTimer = null;
    el('save-bulk-download').hidden = true;
    el('save-bulk-download').removeAttribute('href');
  }

  function idleMessage() {
    if (!bulkAvailable) return 'Open this library on uoassets.com to use bulk downloads. Individual downloads are available below.';
    if (!selection.size) return `Choose assets, or download all ${pageItems.length} on this page as one ZIP. Shared packages are included once.`;
    const selectedPlan = plan(chosen(), document.baseURI);
    return `${plural(selectedPlan.assets, 'asset')} selected · ${plural(selectedPlan.packages.length, 'package')} · ${sizeLabel(selectedPlan.totalBytes)}. Downloads include the original asset ZIPs.`;
  }

  function refresh(updateStatus = false) {
    const count = selection.size;
    el('bulk-downloads').hidden = !pageItems.length;
    el('selected-count').textContent = `${count} selected`;
    el('select-page').checked = count > 0 && count === pageItems.length;
    el('select-page').indeterminate = count > 0 && count < pageItems.length;
    el('select-page').disabled = !bulkAvailable || busy || !pageItems.length;
    el('download-selected').textContent = `Download selected (${count})`;
    el('download-selected').disabled = !bulkAvailable || busy || !count;
    el('download-page').textContent = `Download this page (${pageItems.length})`;
    el('download-page').disabled = !bulkAvailable || busy || !pageItems.length;
    el('clear-selection').disabled = busy || !count;
    el('cancel-download').hidden = !busy;
    for (const input of document.querySelectorAll('input[data-bulk-asset]')) {
      input.checked = selection.has(input.dataset.bulkAsset);
      input.disabled = !bulkAvailable || busy;
      input.closest('.card')?.classList.toggle('is-selected', input.checked);
    }
    if (updateStatus && pageItems.length) el('bulk-download-status').textContent = idleMessage();
  }

  function setPage(items, nextContext) {
    const eligible = items.filter(item => item.download);
    const nextKey = `${nextContext.key}:${eligible.map(item => item.id).join(',')}`;
    const changed = nextKey !== pageKey;
    if (changed) {
      job?.abort(); ++revision; job = null; busy = false; selection.clear(); pageKey = nextKey;
      clearReady();
    }
    pageItems = eligible; context = nextContext;
    refresh(changed);
  }

  function selectionControl(item) {
    if (!item.download) return null;
    const label = document.createElement('label'), input = document.createElement('input');
    label.className = 'asset-select'; input.type = 'checkbox'; input.dataset.bulkAsset = item.id;
    input.setAttribute('aria-label', `Select ${item.name}`); input.checked = selection.has(item.id); input.disabled = !bulkAvailable || busy;
    input.onchange = () => {
      clearReady();
      if (input.checked) selection.add(item.id); else selection.delete(item.id);
      refresh(true);
    };
    label.append(input, document.createTextNode('Select')); return label;
  }

  function notes(downloadPlan) {
    return new Blob([`UO Workshop asset download\nhttps://www.uoassets.com/\n\n${plural(downloadPlan.assets, 'asset')} in ${plural(downloadPlan.packages.length, 'original ZIP package')}.\n\nOpen the included ZIP packages for their game files and installation notes. Assets that share a collection package are included once. A collection package may also contain other assets from that collection.\n\n` + downloadPlan.packages.map(item => `${item.name}\nAssets selected: ${item.assets.join(', ')}\nSHA-256: ${item.sha256}\n`).join('\n')], { type: 'text/plain;charset=utf-8' });
  }

  async function download(kind) {
    if (!bulkAvailable || busy) return;
    const items = kind === 'page' ? pageItems : chosen();
    if (!items.length) return;
    clearReady();
    const current = ++revision, controller = new AbortController();
    job = controller; busy = true; refresh();
    try {
      const downloadPlan = plan(items, document.baseURI);
      const entries = await fetchPackages(downloadPlan, {
        signal: controller.signal,
        onProgress(progress) {
          if (current === revision) el('bulk-download-status').textContent = progress.completed < progress.total ? `Downloading package ${progress.completed + 1} of ${progress.total} · ${sizeLabel(downloadPlan.totalBytes)} total…` : 'Preparing your ZIP…';
        }
      });
      const archive = await root.GALLERY_ARCHIVE.create([{ name: 'DOWNLOADS.txt', blob: notes(downloadPlan) }, ...entries], {
        signal: controller.signal,
        onProgress(progress) {
          if (current === revision) el('bulk-download-status').textContent = `Preparing your ZIP · ${sizeLabel(progress.bytesRead)} of ${sizeLabel(progress.totalBytes)}…`;
        }
      });
      aborted(controller.signal);
      if (current !== revision) return;
      const link = el('save-bulk-download'), url = URL.createObjectURL(archive);
      const label = (context.label || 'assets').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'assets';
      link.href = url; link.download = `uo-workshop-${label}-page-${context.page}-${kind === 'page' ? 'all' : 'selected'}.zip`;
      readyURL = url; link.hidden = false; link.click();
      readyTimer = setTimeout(() => {
        clearReady();
        el('bulk-download-status').textContent = 'This ZIP is no longer available. Use a Download button to prepare it again.';
      }, 300000);
      el('bulk-download-status').textContent = `Your ZIP is ready: ${plural(downloadPlan.assets, 'asset')} in ${plural(downloadPlan.packages.length, 'package')}. Use Save ZIP if the download did not start.`;
    } catch (error) {
      if (current === revision) el('bulk-download-status').textContent = controller.signal.aborted ? 'Cancelled. Your selection is ready to try again.' : (error.message || 'Could not prepare this download. Please try again.');
    } finally {
      if (current === revision) { job = null; busy = false; refresh(); }
    }
  }

  Object.assign(root.GALLERY_BULK_DOWNLOADS, { setPage, selectionControl, refresh });
  el('select-page').onchange = () => { clearReady(); selection.clear(); if (el('select-page').checked) for (const item of pageItems) selection.add(item.id); refresh(true); };
  el('clear-selection').onclick = () => { clearReady(); selection.clear(); refresh(true); };
  el('download-selected').onclick = () => download('selected');
  el('download-page').onclick = () => download('page');
  el('cancel-download').onclick = () => { job?.abort(); el('bulk-download-status').textContent = 'Cancelling download…'; };
})(typeof window === 'undefined' ? globalThis : window);
