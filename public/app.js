/* No credentials belong in this file. The browser receives only the public catalogue. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const data = window.UO_CATALOG;
  if (!data || !Array.isArray(data.assets)) {
    $('result-count').textContent = 'Catalogue could not be loaded.';
    $('empty').hidden = false;
    $('empty-title').textContent = 'The catalogue is unavailable.';
    $('empty-description').textContent = 'Please try again later. The site owner may need to rebuild the catalogue.';
    return;
  }
  const assets = data.assets;
  const pageSize = 24;
  let currentPage = 1;
  let selected = null;
  const fmt = new Intl.NumberFormat('en-GB');
  const make = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const setText = (id, value) => { $(id).textContent = value; };
  const safeUrl = value => {
    try {
      const u = new URL(value);
      return u.protocol === 'https:' && !u.username && !u.password ? u.href : '';
    } catch { return ''; }
  };
  const mediaUrl = key => {
    if (!key || !data.site.assetBaseUrl) return '';
    const base = safeUrl(data.site.assetBaseUrl.replace(/\/$/, '') + '/');
    if (!base || !/^[A-Za-z0-9_/-][A-Za-z0-9_./-]*$/.test(key) || key.startsWith('/') || key.split('/').some(x => !x || x === '.' || x === '..')) return '';
    const u = new URL(key, base);
    return u.href.startsWith(base) ? u.href : '';
  };
  function link(label, url, cls) {
    const a = make('a', cls, label);
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }
  document.querySelectorAll('[data-site-name]').forEach(e => { e.textContent = data.site.name; });
  document.querySelectorAll('[data-owner]').forEach(e => { e.textContent = data.site.owner; });
  document.title = data.site.name;
  if (data.site.contactEmail && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(data.site.contactEmail)) {
    $('contact').href = 'mailto:' + data.site.contactEmail;
    $('contact').hidden = false;
  }
  setText('pack-count', fmt.format(assets.length));
  setText('frame-count', fmt.format(assets.reduce((n, a) => n + (a.frameCount || 0), 0)));
  const categories = [...new Set(assets.map(a => a.category))].sort();
  setText('category-count', fmt.format(categories.length));
  setText('collection-status', assets.length ? 'Open for browsing' : 'In preparation');
  categories.forEach(c => { const o = make('option', '', c); o.value = c; $('category').append(o); });
  function filteredAssets() {
    const terms = $('search').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const category = $('category').value;
    const filtered = assets.filter(a => {
      const searchText = [a.name, a.bodyId, a.category, a.creator, a.summary, a.format, ...(a.tags || [])].join(' ').toLowerCase();
      return (!category || a.category === category) && terms.every(t => searchText.includes(t));
    });
    if ($('sort').value === 'newest') filtered.sort((a, b) => b.updated.localeCompare(a.updated) || a.name.localeCompare(b.name));
    else if ($('sort').value === 'body') filtered.sort((a, b) => (Number(a.bodyId || Infinity) - Number(b.bodyId || Infinity)) || a.name.localeCompare(b.name));
    else filtered.sort((a, b) => a.name.localeCompare(b.name));
    return filtered;
  }
  function card(asset) {
    const article = make('article', 'asset-card');
    const art = make('div', 'card-art');
    const src = mediaUrl(asset.thumbnailKey);
    if (src) {
      const img = make('img'); img.src = src; img.alt = asset.name + ' preview'; img.loading = 'lazy'; img.decoding = 'async';
      img.addEventListener('error', () => art.replaceChildren(make('span', '', 'Preview unavailable')), {once:true});
      art.append(img);
    } else art.append(make('span', '', 'No thumbnail supplied'));
    const body = make('div', 'card-body');
    const line = make('div', 'card-topline');
    line.append(make('span', '', asset.category), make('span', '', asset.bodyId || asset.version));
    body.append(line, make('h3', '', asset.name), make('p', 'card-summary', asset.summary), make('div', 'card-meta', asset.format + ' · ' + asset.creator));
    const button = make('button', 'secondary', 'Preview & details'); button.type = 'button';
    button.setAttribute('aria-label', 'Preview and details: ' + asset.name);
    button.append(make('span', '', '↗'));
    button.addEventListener('click', () => showAsset(asset));
    body.append(button); article.append(art, body); return article;
  }
  function render() {
    const filtered = filteredAssets();
    const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    currentPage = Math.min(currentPage, pages);
    $('cards').replaceChildren(...filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(card));
    setText('result-count', `${fmt.format(filtered.length)} ${filtered.length === 1 ? 'pack' : 'packs'}${filtered.length !== assets.length ? ' found' : ' in the library'}`);
    $('empty').hidden = filtered.length > 0;
    $('reset').hidden = assets.length === 0;
    if (assets.length) {
      setText('empty-title', 'No packs match your search.');
      setText('empty-description', 'Try another name, body ID, creator, or category.');
    }
    $('pagination').hidden = pages <= 1;
    $('previous').disabled = currentPage <= 1;
    $('next').disabled = currentPage >= pages;
    setText('page-info', `Page ${currentPage} of ${pages}`);
  }
  function showPreview() {
    const stage = $('preview-stage');
    // Stop any playing video when switching variants.
    stage.querySelectorAll('video').forEach(v => { v.pause(); v.removeAttribute('src'); v.load(); });
    stage.replaceChildren();
    const preview = selected.previews[Number($('preview-select').value) || 0];
    const src = preview ? mediaUrl(preview.key) : mediaUrl(selected.thumbnailKey);
    if (!src) { stage.append(make('p', '', 'No preview has been supplied for this pack.')); return; }
    const isVideo = preview && preview.type === 'video';
    const element = make(isVideo ? 'video' : 'img');
    if (isVideo) { element.controls = true; element.loop = true; element.muted = true; element.playsInline = true; element.preload = 'metadata'; element.setAttribute('aria-label', selected.name + ' animation preview'); }
    else element.alt = selected.name + (preview ? ' — ' + preview.label : ' preview');
    element.src = src;
    element.addEventListener('error', () => { stage.replaceChildren(make('p', '', 'This preview could not be loaded.')); }, {once: true});
    stage.append(element);
  }
  function showAsset(asset) {
    selected = asset;
    setText('detail-title', asset.name); setText('detail-category', asset.category);
    setText('detail-description', asset.description || asset.summary);
    const meta = [ ['Body ID', asset.bodyId || 'Not specified'], ['Version', asset.version], ['Format', asset.format], ['Updated', asset.updated] ];
    for (const [key, label] of [['frameCount','Frames'],['actionCount','Actions'],['directionCount','Directions']]) if (asset[key] != null) meta.push([label, fmt.format(asset[key])]);
    $('detail-metadata').replaceChildren(...meta.flatMap(([k,v]) => [make('dt', '', k), make('dd', '', v)]));
    setText('detail-credit', 'Creator: ' + asset.creator);
    setText('detail-licence', asset.license);
    const sourceUrl = safeUrl(asset.sourceUrl);
    $('detail-source').hidden = !sourceUrl;
    if (sourceUrl) $('detail-source').href = sourceUrl;
    setText('detail-installation', asset.installation || 'No installation notes supplied. Check compatibility before changing your files, and keep backups.');
    setText('preview-note', 'Previews are for inspection. Downloaded source files retain the layout supplied by the pack creator.');
    $('preview-select').replaceChildren(...asset.previews.map((p, i) => { const o = make('option', '', p.label); o.value = String(i); return o; }));
    $('preview-select-label').hidden = asset.previews.length < 2;
    showPreview();
    $('detail-downloads').replaceChildren(...asset.downloads.map(d => {
      const url = mediaUrl(d.key);
      const label = d.label + (d.sizeBytes ? ` (${fmt.format(Math.round(d.sizeBytes / 1024 / 1024 * 10) / 10)} MiB)` : '');
      return url ? link(label + ' ↗', url, 'primary') : make('p', 'small-note', 'Download unavailable: storage is not connected.');
    }));
    $('asset-dialog').showModal();
  }
  ['search','category','sort'].forEach(id => $(id).addEventListener(id === 'search' ? 'input' : 'change', () => { currentPage = 1; render(); }));
  $('reset').addEventListener('click', () => { $('search').value = ''; $('category').value = ''; currentPage = 1; render(); $('search').focus(); });
  $('previous').addEventListener('click', () => { currentPage--; render(); $('library').scrollIntoView(); });
  $('next').addEventListener('click', () => { currentPage++; render(); $('library').scrollIntoView(); });
  $('preview-select').addEventListener('change', showPreview);
  $('close-dialog').addEventListener('click', () => $('asset-dialog').close());
  $('asset-dialog').addEventListener('close', () => { $('preview-stage').querySelectorAll('video').forEach(v => v.pause()); });
  render();
})();
