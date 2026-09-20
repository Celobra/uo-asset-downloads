/** Validate publication metadata; this is NOT a legal rights determination or a storage ACL. */
export function buildCatalogue(input) {
  const fail = message => { throw new Error(message); };
  const text = (value, label, max = 6000) => {
    if (typeof value !== 'string' || !value.trim() || value.length > max) fail(`${label}: supply a non-empty string (up to ${max} characters).`);
    return value.trim();
  };
  const publicUrl = (value, label) => {
    if (!value) return '';
    if (typeof value !== 'string') fail(`${label}: must be an HTTPS URL.`);
    let u; try { u = new URL(value); } catch { fail(`${label}: invalid URL.`); }
    if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash) fail(`${label}: use an HTTPS URL without credentials, query strings, or a fragment.`);
    return u.href;
  };
  const key = (value, label) => {
    text(value, label, 1000);
    if (!/^[A-Za-z0-9_/-][A-Za-z0-9_./-]*$/.test(value) || value.startsWith('/') || value.includes('\\') || value.split('/').some(x => !x || x === '.' || x === '..')) fail(`${label}: use a relative object key with letters, digits, hyphens, underscores, dots, and slashes only; no spaces or traversal.`);
    return value;
  };
  if (!input || typeof input !== 'object' || !input.site || !Array.isArray(input.assets)) fail('The catalogue must contain a site object and an assets array.');
  const site = {
    name: text(input.site.name, 'site.name', 100),
    owner: text(input.site.owner, 'site.owner', 100),
    assetBaseUrl: publicUrl(input.site.assetBaseUrl, 'site.assetBaseUrl').replace(/\/$/, ''),
    contactEmail: input.site.contactEmail || ''
  };
  if (site.contactEmail && (typeof site.contactEmail !== 'string' || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(site.contactEmail))) fail('site.contactEmail: invalid email address.');
  const seen = new Set();
  const assets = [];
  for (const [i, asset] of input.assets.entries()) {
    if (!asset || typeof asset !== 'object' || typeof asset.published !== 'boolean') fail(`Asset ${i + 1}: published must be true or false.`);
    if (!asset.published) continue; // Drafts and private rights notes are never emitted to public/.
    const id = text(asset.id, `Asset ${i + 1} id`, 100);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || seen.has(id)) fail(`${id}: use a unique lowercase slug.`);
    seen.add(id);
    if (!asset.rights || asset.rights.status !== 'approved' || !asset.rights.evidence?.trim() || !asset.rights.reviewedBy?.trim()) fail(`${id}: published assets require approved rights, evidence, and a reviewer.`);
    if (!site.assetBaseUrl) fail(`${id}: configure site.assetBaseUrl before publishing.`);
    const a = {id};
    for (const [field, max] of [['name',160],['category',100],['summary',350],['creator',200],['license',6000],['format',200],['version',100]]) a[field] = text(asset[field], `${id}.${field}`, max);
    a.description = asset.description ? text(asset.description, `${id}.description`) : '';
    a.installation = asset.installation ? text(asset.installation, `${id}.installation`, 12000) : '';
    a.bodyId = asset.bodyId || '';
    if (a.bodyId && (typeof a.bodyId !== 'string' || !/^(?:0x[0-9a-fA-F]+|\d+)$/.test(a.bodyId))) fail(`${id}.bodyId: use a decimal string or 0x-prefixed hexadecimal.`);
    a.updated = text(asset.updated, `${id}.updated`, 10);
    const parsed = new Date(a.updated + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.updated) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== a.updated) fail(`${id}.updated: use a real YYYY-MM-DD date.`);
    a.sourceUrl = publicUrl(asset.sourceUrl, `${id}.sourceUrl`);
    a.tags = asset.tags || [];
    if (!Array.isArray(a.tags) || a.tags.length > 40 || a.tags.some(t => typeof t !== 'string' || !t.trim() || t.length > 100)) fail(`${id}.tags: supply up to 40 short strings.`);
    for (const field of ['frameCount','actionCount','directionCount']) {
      a[field] = asset[field] ?? null;
      if (a[field] !== null && (!Number.isSafeInteger(a[field]) || a[field] < 0)) fail(`${id}.${field}: use a non-negative integer or null.`);
    }
    a.thumbnailKey = asset.thumbnailKey ? key(asset.thumbnailKey, `${id}.thumbnailKey`) : '';
    const previews = asset.previews || [];
    if (!Array.isArray(previews)) fail(`${id}.previews: must be an array.`);
    a.previews = previews.map((p, n) => {
      if (!p || !['image','video'].includes(p.type)) fail(`${id}.previews[${n}]: type must be image or video.`);
      return {label: text(p.label, `${id}.preview label`, 200), type: p.type, key: key(p.key, `${id}.preview key`)};
    });
    if (!Array.isArray(asset.downloads) || !asset.downloads.length) fail(`${id}: supply at least one download.`);
    a.downloads = asset.downloads.map((d, n) => {
      if (!d || typeof d !== 'object') fail(`${id}.downloads[${n}]: expected an object.`);
      const size = d.sizeBytes ?? null;
      if (size !== null && (!Number.isSafeInteger(size) || size < 0)) fail(`${id}.download sizeBytes: use a non-negative integer or null.`);
      return {label: text(d.label, `${id}.download label`, 200), key: key(d.key, `${id}.download key`), sizeBytes:size};
    });
    assets.push(a);
  }
  return {site, assets};
}
