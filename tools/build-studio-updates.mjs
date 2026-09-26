import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const labels = { added: 'Added', improved: 'Improved', fixed: 'Fixed' };
const anchor = version => 'v' + version.replaceAll('.', '-');

export async function buildStudioUpdates() {
  const { releases } = JSON.parse(await readFile(resolve(root, 'data/studio-updates.json'), 'utf8'));
  if (!releases.length || new Set(releases.map(r => r.version)).size !== releases.length) throw new Error('Studio updates need unique versions.');
  // Read the maintained overview shell so installer links and shared navigation stay current.
  const overviewPath = resolve(root, 'public/studio/index.html');
  const overview = await readFile(overviewPath, 'utf8');
  const [shell, body] = overview.split('<main id="main">');
  if (!body || !body.includes('<section class="closing wrap">')) throw new Error('Studio page shell is missing.');
  const addNavigation = html => html.replace(/<nav aria-label="Studio">.*?<\/nav>/, nav => nav.includes('href="/studio/updates/"') ? nav : nav.replace('</nav>', '<a href="/studio/updates/">Updates</a></nav>'));
  const title = 'Updates and release history · UO Asset Studio';
  const description = 'Every documented UO Asset Studio release: new features, fixes and improvements, from the early asset tools to the latest version.';
  let head = addNavigation(shell)
    .replace(/<title>.*?<\/title>/, `<title>${title}</title>`)
    .replace(/(<meta (?:name="description"|property="og:description") content=")[^"]*/g, '$1' + description)
    .replace(/(<meta property="og:title" content=")[^"]*/, '$1' + title)
    .replaceAll('https://uo-asset-library.farthrex.workers.dev/studio/"', 'https://uo-asset-library.farthrex.workers.dev/studio/updates/"')
    .replace(' href="/studio/" aria-current="page"', ' href="/studio/"')
    .replace(' href="/studio/updates/"', ' href="/studio/updates/" aria-current="page"')
    .replace('</head>', '<link rel="stylesheet" href="/studio/updates/updates.css"><script src="/studio/updates/updates.js" defer></script></head>');
  const latest = releases[0];
  const changeCount = releases.reduce((n, r) => n + Object.keys(labels).reduce((s, key) => s + (r[key]?.length || 0), 0), 0);
  const versionLinks = releases.map(r => `<a href="#${anchor(r.version)}">${escape(r.version)}</a>`).join('');
  const entries = releases.map((r, index) => {
    const date = r.date ? `<time datetime="${escape(r.date)}">${new Intl.DateTimeFormat('en-GB', { day:'numeric', month:'long', year:'numeric', timeZone:'UTC' }).format(new Date(r.date))}</time>` : '<span>Development release</span>';
    const groups = Object.entries(labels).filter(([key]) => r[key]?.length).map(([key, label]) => `<div class="change-group" data-kind="${key}"><h3>${label}</h3><ul>${r[key].map(line => `<li>${escape(line)}</li>`).join('')}</ul></div>`).join('\n');
    return `<article class="release-entry${index === 0 ? ' latest' : ''}" id="${anchor(r.version)}" aria-labelledby="${anchor(r.version)}-title">
<div class="release-meta"><a href="#${anchor(r.version)}" class="version-link" aria-label="Link to version ${escape(r.version)}">v${escape(r.version)}</a>${date}${index === 0 ? '<span class="release-badge">Latest version</span>' : ''}</div>
<div class="release-body"><h2 id="${anchor(r.version)}-title">${escape(r.title)}</h2>${groups}${r.note ? `<p class="release-note">${escape(r.note)}</p>` : ''}${r.release ? `<a class="text-link" href="https://github.com/Celobra/uo-asset-downloads/releases/tag/uo-asset-studio-v${escape(r.version)}">Release files &amp; notes ↗</a>` : ''}</div></article>`;
  }).join('\n');
  const tail = '<section class="closing wrap">' + body.split('<section class="closing wrap">')[1];
  const html = head + `<main id="main">
<section class="wrap page-intro"><p class="eyebrow">UO ASSET STUDIO / RELEASE HISTORY</p><h1>What’s new.<br><em>What’s been fixed.</em></h1><p class="lead">Follow the changes to your workshop, from new creative tools to the fixes that make everyday work easier.</p><div class="actions"><a class="button primary" href="https://github.com/Celobra/uo-asset-downloads/releases/download/uo-asset-studio-v${escape(latest.version)}/UOAssetStudio-Setup-${escape(latest.version)}.exe">Download the latest version ↓</a><a class="text-link" href="/studio/downloads/#guide">Read the complete guide →</a></div><p class="small">${releases.length} documented versions · ${changeCount} changes · Newest first</p></section>
<section class="wrap client-update" aria-labelledby="client-update-title"><p class="eyebrow">ALSO UPDATED / CUSTOM CLASSICUO</p><h2 id="client-update-title">Client Update 3 — 26 September 2026</h2><p>The client revision fixes script handling, permissions, saved settings, hand aliases and overlapping restock rules. The updated Standard download, guide and verification notes are available on the client page.</p><a class="text-link" href="/client/#updates">Read the ClassicUO client updates →</a></section>
<div class="wrap updates-layout"><aside class="release-index"><details open><summary>Jump to a version</summary><nav aria-label="Release versions">${versionLinks}</nav><p class="small">Earlier entries are reconstructed from the application’s release notes and verified development records. Dates are shown for published GitHub releases. Some early fixes shared a version number.</p></details></aside>
<div class="updates-main"><div class="update-filters" hidden><div><label for="update-search">Find a change</label><input id="update-search" type="search" placeholder="Try armor, sound, permissions…" autocomplete="off"></div><div><label for="update-kind">Change type</label><select id="update-kind"><option value="all">All changes</option><option value="added">Added</option><option value="fixed">Fixed</option><option value="improved">Improved</option></select></div><button type="button" id="reset-updates">Clear filters</button><p id="update-count" role="status" aria-live="polite"></p></div>
<div id="release-list">${entries}</div><p id="no-updates" hidden>No changes match. Try a different word or clear the filters.</p><a class="text-link back-top" href="#main">Back to top ↑</a></div></div>
` + tail;
  await mkdir(resolve(root, 'public/studio/updates'), { recursive:true });
  await writeFile(resolve(root, 'public/studio/updates/index.html'), html);
  for (const page of ['index.html', 'workflows/index.html', 'downloads/index.html']) {
    const path = resolve(root, 'public/studio', page);
    const original = await readFile(path, 'utf8');
    let updated = addNavigation(original);
    if (page === 'downloads/index.html' && !updated.includes('Read the full update history')) updated = updated.replace('<p>The development unittest suite', '<p><a class="text-link" href="/studio/updates/">Read the full update history →</a></p>\n<p>The development unittest suite');
    if (updated !== original) await writeFile(path, updated);
  }
  console.log(`Built Studio updates: ${releases.length} versions, ${changeCount} changes.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildStudioUpdates();
