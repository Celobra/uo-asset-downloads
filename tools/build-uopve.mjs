import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderBestiary } from './uopve-bestiary.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const base = '/uopve/';
const articleUrl = article => `${base}wiki/${article.slug}/`;
const dateLabel = date => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const validDate = date => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
const validChangedAt = update => !update.changedAt || (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(update.changedAt) && Number.isFinite(Date.parse(update.changedAt)) && new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(update.changedAt)) === update.date);
const updateDateLabel = update => update.changedAt ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/London', timeZoneName: 'short' }).format(new Date(update.changedAt)) : dateLabel(update.date);
const navItems = [['overview', 'The realm', base], ['introduction', 'Introduction', `${base}introduction/`], ['wiki', 'Wiki', `${base}wiki/`], ['downloads', 'Availability', `${base}downloads/`], ['updates', 'Updates', `${base}updates/`]];
const paragraphs = values => (values || []).map(value => `<p>${esc(value)}</p>`).join('\n');
const tableContent = (table, section, index, sharedFilter = '') => {
  const prefix = sharedFilter || `reference-${section.id}-${index}`;
  const filter = Boolean(sharedFilter) || table.rows.length > 15;
  return `${filter && !sharedFilter ? `<div class="reference-tools"><label for="${prefix}-search">Find in ${esc(table.caption || section.title)}<input id="${prefix}-search" type="search" maxlength="150" placeholder="Filter by name or value…" data-reference-filter="${prefix}"></label><p id="${prefix}-results" role="status" aria-live="polite">${table.rows.length} entries</p></div>` : ''}<div class="reference-table"${sharedFilter ? ` data-reference-section="${sharedFilter}"` : ''} tabindex="0" role="region" aria-label="${esc(table.caption || section.title)}"><table>${table.caption ? `<caption>${esc(table.caption)}</caption>` : ''}<thead><tr>${table.columns.map(column => `<th scope="col">${esc(column)}</th>`).join('')}</tr></thead><tbody>${table.rows.map(row => `<tr${filter ? ` data-reference-entry="${prefix}" data-search="${esc([section.title, table.caption || '', ...row].join(' '))}"` : ''}>${row.map((cell, cellIndex) => cellIndex === 0 ? `<th scope="row">${esc(cell)}</th>` : `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${filter && !sharedFilter ? `<p id="${prefix}-empty" class="callout" hidden>No entries match. Clear the search to see the full table.</p>` : ''}`;
};
const articleSearch = article => [article.title, article.category, article.summary, article.keywords, ...article.sections.flatMap(section => [section.title, ...(section.paragraphs || []), ...(section.lists || []).flatMap(list => list.items), ...(section.tables || []).flatMap(table => table.rows.flat())])].join(' ');
const sectionContent = (section, sharedFilter = '') => paragraphs(section.paragraphs)
  + (section.lists || []).map(list => `${list.title ? `<h3>${esc(list.title)}</h3>` : ''}<ul>${list.items.map(item => `<li>${esc(item)}</li>`).join('')}</ul>`).join('\n')
  + (section.tables || []).map((table, index) => tableContent(table, section, index, sharedFilter)).join('\n');
const button = (url, text, secondary = false) => `<a class="button${secondary ? ' button-secondary' : ''}" href="${esc(url)}">${esc(text)}</a>`;
const breadcrumb = (label, article = false) => `<nav class="breadcrumb wrap" aria-label="Breadcrumb"><a href="/">UO Workshop</a><span aria-hidden="true">/</span><a href="${base}">UO:PvE</a>${article ? `<span aria-hidden="true">/</span><a href="${base}wiki/">Wiki</a>` : ''}<span aria-hidden="true">/</span><span aria-current="page">${esc(label)}</span></nav>`;

let availabilityMessage = '';
function page({ title, description, path, active, content }) {
  const url = `https://www.uoassets.com${path}`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · UO:PvE</title><meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}"><meta property="og:url" content="${url}"><meta property="og:type" content="website"><meta property="og:title" content="${esc(title)} · UO:PvE"><meta property="og:description" content="${esc(description)}"><meta property="og:image" content="https://www.uoassets.com/uopve/media/realm.png">
<link rel="stylesheet" href="/uopve/uopve.css"><script src="/uopve/uopve.js" defer></script></head>
<body class="pve${active === 'wiki' ? ' wiki-page' : ''}"><a class="skip-link" href="#main">Skip to content</a>
<header class="site-header"><div class="header-inner"><a class="brand" href="/uopve/" aria-label="UO:PvE home"><span class="brand-mark" aria-hidden="true">UO</span><span class="brand-copy">UO:PvE<small>Adventure awaits in Britannia</small></span></a><nav class="global-nav" aria-label="UO Workshop"><a href="/">Asset library</a><a href="/studio/">UO Asset Studio</a><a href="/client/">Custom ClassicUO</a></nav></div></header>
<nav class="section-nav" aria-label="UO:PvE"><div class="wrap">${navItems.map(([id, label, href]) => `<a href="${href}"${id === active ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</div></nav>
<main id="main"><aside class="callout wrap" aria-label="Public access status">${esc(availabilityMessage)}</aside>${content}</main>
<footer class="site-footer"><div class="footer-inner wrap"><div><a class="brand" href="/uopve/">UO:PvE</a><p>A new adventure in a familiar world.</p></div><nav aria-label="Footer"><a href="/uopve/wiki/">Player wiki</a><a href="/uopve/downloads/">Availability</a><a href="/uopve/updates/">Updates</a><a href="/">UO Workshop</a></nav></div></footer>
</body></html>
`;
}

export async function buildUopve() {
  const data = JSON.parse(await readFile(resolve(root, 'data/uopve.json'), 'utf8'));
  const { release, articles, updates, availability } = data;
  if (availability?.publicPlay !== false || typeof availability.message !== 'string' || !availability.message.trim()) throw Error('UO:PvE public access must remain on hold until explicitly opened.');
  availabilityMessage = availability.message;
  const bestiary = articles.some(article => article.catalog === 'bestiary') ? JSON.parse(await readFile(resolve(root, 'data/uopve-bestiary.json'), 'utf8')) : null;
  const bestiaryHtml = bestiary ? renderBestiary(bestiary) : '';
  const slugs = new Set(articles.map(article => article.slug));
  if (!articles.length || slugs.size !== articles.length || articles.some(article => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug))) throw Error('UO:PvE wiki needs unique safe article slugs.');
  if (!validDate(release.date) || !/^\d+\.\d+\.\d+$/.test(release.version) || release.tag !== `client-v${release.version}` || !/^[a-f0-9]{64}$/.test(release.sha256) || !Number.isSafeInteger(release.sizeBytes) || release.sizeBytes < 1) throw Error('UO:PvE release metadata is invalid.');
  const releasePrefix = `https://github.com/Celobra/UOPvE-Client/releases/download/${release.tag}/`;
  if (release.installer !== `${releasePrefix}UOPvE-Setup.exe` || release.portable !== `${releasePrefix}UOPvE-Launcher.exe` || release.url !== `https://github.com/Celobra/UOPvE-Client/releases/tag/${release.tag}`) throw Error('UO:PvE downloads must match the named public release.');
  for (const article of articles) {
    const ids = article.sections.map(section => section.id);
    if (new Set(ids).size !== ids.length || ids.some(id => !/^[a-z0-9-]+$/.test(id)) || ids.some(id => ['main', 'article-title', 'related-title', 'article-reference-search', 'article-reference-results', 'article-reference-empty'].includes(id))) throw Error(`Invalid section anchors in ${article.slug}.`);
    if ((article.related || []).some(slug => !slugs.has(slug))) throw Error(`Unknown related article in ${article.slug}.`);
    if (article.catalog && article.catalog !== 'bestiary') throw Error(`Unknown catalogue in ${article.slug}.`);
    if (article.catalog === 'bestiary' && ids.some(id => ['creature-catalogue', 'loot-selections'].includes(id))) throw Error(`Reserved catalogue anchor in ${article.slug}.`);
    for (const section of article.sections) {
      for (const table of section.tables || []) {
        if (!Array.isArray(table.columns) || !table.columns.length || !Array.isArray(table.rows) || table.rows.some(row => !Array.isArray(row) || row.length !== table.columns.length || row.some(cell => typeof cell !== 'string'))) throw Error(`Invalid reference table in ${article.slug}/${section.id}.`);
      }
      if ((section.lists || []).some(list => !Array.isArray(list.items) || list.items.some(item => typeof item !== 'string'))) throw Error(`Invalid reference list in ${article.slug}/${section.id}.`);
    }
  }
  if (new Set(updates.map(update => update.id)).size !== updates.length || updates.some(update => !validDate(update.date) || !validChangedAt(update) || ['main', 'update-search', 'update-results', 'update-empty'].includes(update.id) || !/^[a-z0-9-]+$/.test(update.id) || !(/^\/uopve\//.test(update.link) || update.link.startsWith('https://github.com/Celobra/UOPvE-Client/releases/')))) throw Error('UO:PvE updates need unique IDs, publication dates and valid links.');

  async function save(path, options) {
    const directory = resolve(root, 'public', path.replace(/^\//, ''));
    await mkdir(directory, { recursive: true });
    await writeFile(resolve(directory, 'index.html'), page({ ...options, path }), 'utf8');
  }
  const latest = updates[0];
  await save(base, {
    title: 'Adventure awaits in Britannia', description: 'Discover UO:PvE: quests, character progression and the Hunter’s Guild. Read the player wiki, development status and latest updates. Public play is not open yet.', active: 'overview',
    content: `<section class="hero-grid wrap"><div class="hero-copy"><p class="eyebrow">ULTIMA ONLINE · A WORLD TO EXPLORE</p><h1>Your next<br><em>adventure awaits.</em></h1><p class="lead">Welcome to UO:PvE. Follow a quest, develop your character and take on the wilds of Britannia with the Hunter’s Guild at your side.</p><div class="actions">${button('/uopve/wiki/', 'Explore the wiki →')}${button('/uopve/introduction/', 'Discover the realm →', true)}</div><p class="hero-meta">In development · Public play is not open yet</p></div><figure class="hero-visual"><img src="/uopve/media/realm.png" width="640" height="480" alt="UO:PvE realm artwork: moonlit castles overlooking a mountain lake"><figcaption>The developing realm of UO:PvE</figcaption></figure></section>
<section class="section wrap" aria-labelledby="hub-title"><div class="section-heading"><p class="eyebrow">YOUR JOURNEY STARTS HERE</p><h2 id="hub-title">Find your way into the realm.</h2><p>Everything you need to get ready, learn the world and keep up with what’s new.</p></div><div class="portal-grid">${[
      ['01', 'Introduction', 'Meet UO:PvE and discover the quests, hunts and progression that shape your adventure.', 'introduction', 'Explore the realm'],
      ['02', 'Player wiki', 'From your first quest to your next talent point. Search the guides and find your footing.', 'wiki', 'Open the wiki'],
      ['03', 'Availability', 'UO:PvE is in development. Public play and launcher downloads are not available yet.', 'downloads', 'Check development status'],
      ['04', 'Updates', 'Read dated gameplay changes, client releases and new player guides.', 'updates', 'Read the latest']
    ].map(([n, title, text, route, action]) => `<article class="portal-card"><span class="card-number" aria-hidden="true">${n}</span><h3>${title}</h3><p>${text}</p><a class="text-link" href="/uopve/${route}/">${action} →</a></article>`).join('')}</div></section>
<section class="section wrap split"><div><p class="eyebrow">QUESTS. COMPANIONS. PROGRESSION.</p><h2>An adventure<br>that grows with you.</h2><p>Accept a Guild contract, follow The Undying March or develop a companion through combat. Classes, talents and earned titles give you more to work towards.</p><a class="text-link" href="/uopve/wiki/getting-started/">Read your first steps →</a></div><aside class="panel"><p class="eyebrow">LATEST UPDATE</p><span class="tag">${esc(latest.category)}</span><p><time datetime="${latest.date}">${dateLabel(latest.date)}</time></p><h3>${esc(latest.title)}</h3><p>${esc(latest.summary)}</p><a class="text-link" href="/uopve/updates/#${latest.id}">Read the update →</a></aside></section>`
  });

  await save(`${base}introduction/`, {
    title: 'Welcome to the realm', description: 'An introduction to UO:PvE, its quests, Hunter’s Guild, classes, talents and companion progression.', active: 'introduction',
    content: `${breadcrumb('Introduction')}<section class="page-heading wrap"><p class="eyebrow">WELCOME TO UO:PvE</p><h1>A familiar world.<br><em>A fresh adventure.</em></h1><p class="lead">UO:PvE brings quests, character progression and the Hunter’s Guild to Ultima Online. Set out into Britannia with a new goal, an old friend or a companion of your own.</p></section>
<section class="section wrap feature-grid"><article class="feature-card"><span class="card-number">01 / ADVENTURE</span><h2>Follow the next quest.</h2><p>Take on supply deliveries, monster bounties and expeditions. Follow the seven stages of The Undying March, with your journal keeping track along the way.</p><a class="text-link" href="/uopve/wiki/quest-journal/">Quests & the journal →</a></article><article class="feature-card"><span class="card-number">02 / THE GUILD</span><h2>Answer the call.</h2><p>Visit the Hunter’s Guildmaster in Britain. Accept contracts, join the weekly quarry hunt, earn Guild Marks and work towards the Guild’s rewards.</p><a class="text-link" href="/uopve/wiki/hunters-guild/">Meet the Hunter’s Guild →</a></article><article class="feature-card"><span class="card-number">03 / YOUR CHARACTER</span><h2>Make progress your own.</h2><p>Choose from nine classes, develop talents as you level and collect achievement titles. Your pets can gain experience and grow through combat, too.</p><a class="text-link" href="/uopve/wiki/classes-and-talents/">Classes & talents →</a></article></section>
<section class="section wrap"><p class="eyebrow">IN DEVELOPMENT</p><h2>Explore the realm while it takes shape.</h2><p>${esc(availabilityMessage)}</p><div class="actions">${button('/uopve/wiki/', 'Browse the player wiki →')}${button('/uopve/updates/', 'Follow development →', true)}</div></section>`
  });

  const categories = [...new Set(articles.map(article => article.category))];
  const topicId = category => `wiki-topic-${category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
  const topicLinks = categories.map(category => `<a href="#${topicId(category)}" data-wiki-topic-link="${topicId(category)}">${esc(category)}</a>`).join('');
  const guideDirectory = categories.map(category => {
    const guides = articles.filter(article => article.category === category);
    return `<section class="wiki-topic" id="${topicId(category)}" data-wiki-topic aria-labelledby="${topicId(category)}-title"><h2 id="${topicId(category)}-title">${esc(category)} <span class="wiki-topic-count" data-wiki-topic-count>${guides.length} ${guides.length === 1 ? 'guide' : 'guides'}</span></h2><ul class="wiki-link-list">${guides.map(article => `<li class="wiki-guide" data-wiki-entry data-category="${esc(article.category)}" data-search="${esc(articleSearch(article))}"><a class="wiki-guide-title" href="${articleUrl(article)}">${esc(article.title)}</a><p>${esc(article.summary)}</p></li>`).join('')}</ul></section>`;
  }).join('');
  const nearbyGuides = current => articles.filter(article => article.category === current.category).map(article => `<a href="${articleUrl(article)}"${article.slug === current.slug ? ' aria-current="page"' : ''}>${esc(article.title)}</a>`).join('');
  await save(`${base}wiki/`, {
    title: 'Player wiki', description: 'Search UO:PvE spell damage, weapon swing times, creatures, treasure maps, classes, crafting, quests and housing.', active: 'wiki',
    content: `${breadcrumb('Wiki')}<header class="wiki-heading wrap"><p class="eyebrow">PLAYER GUIDES & REFERENCE</p><h1>UO:PvE Wiki</h1><p class="lead">Learn the world, plan your character and look up the details you need.</p><nav class="wiki-start" aria-label="Start here"><strong>New to the realm?</strong><a href="/uopve/wiki/getting-started/">First steps</a><a href="/uopve/wiki/classes-and-talents/">Classes & talents</a><a href="/uopve/wiki/quest-journal/">Quests</a><a href="/uopve/wiki/client-features-and-player-commands/">Player commands</a></nav></header><div class="wiki-directory-layout wrap"><aside class="wiki-topic-nav"><details class="wiki-topic-menu" data-wiki-contents><summary>Browse topics</summary><nav aria-label="Wiki topics">${topicLinks}</nav></details></aside><div class="wiki-directory-body"><div class="wiki-tools" role="search" aria-label="Search the wiki"><label for="wiki-search">Search the wiki<input id="wiki-search" type="search" maxlength="150" placeholder="Try spell damage, treasure maps, dragon or crafting…"></label><label for="wiki-category">Filter by topic<select id="wiki-category"><option value="all">All topics</option>${categories.map(category => `<option value="${esc(category)}">${esc(category)}</option>`).join('')}</select></label></div><p id="wiki-results" role="status" aria-live="polite">${articles.length} guides</p><div class="wiki-directory">${guideDirectory}</div><p id="wiki-empty" class="wiki-note" hidden>No guides match that search. Try a shorter term or choose All topics.</p><noscript><p class="wiki-note">All guides are listed here. Enable JavaScript to filter by topic or search.</p></noscript><p class="wiki-note">These guides describe the current UO:PvE configuration. Check the in-game panels for current requirements and rewards as the server develops.</p></div></div>`
  });
  for (const article of articles) {
    const tables = article.sections.flatMap(section => section.tables || []);
    const rowCount = tables.reduce((count, table) => count + table.rows.length, 0);
    const sharedFilter = tables.length > 1 && rowCount > 40 ? 'article-reference' : '';
    const referenceSearch = sharedFilter ? `<div class="reference-tools article-reference-search" role="search" aria-label="Search reference tables"><label for="article-reference-search">Find in this guide’s reference tables<input id="article-reference-search" type="search" maxlength="150" placeholder="Search a name, recipe, requirement or value…" data-reference-filter="article-reference"></label><p id="article-reference-results" role="status" aria-live="polite">${rowCount} entries</p><p id="article-reference-empty" class="wiki-note" hidden>No entries match. Clear the search to see the complete guide.</p></div>` : '';
    await save(articleUrl(article), {
      title: article.title, description: article.summary, active: 'wiki',
      content: `${breadcrumb(article.title, true)}<div class="article-layout wrap"><aside class="wiki-sidebar article-sidebar"><a class="wiki-back" href="/uopve/wiki/">← Wiki directory</a><details class="wiki-contents" data-wiki-contents><summary>Contents</summary><nav aria-label="On this page">${article.sections.map(section => `<a href="#${section.id}">${esc(section.title)}</a>`).join('')}${article.catalog === 'bestiary' ? '<a href="#creature-catalogue">Creature catalogue</a><a href="#loot-selections">Loot selections</a>' : ''}</nav></details><details class="wiki-nearby"><summary>More in ${esc(article.category)}</summary><nav aria-label="Wiki articles">${nearbyGuides(article)}</nav></details></aside><article class="article-body"><header class="page-heading wiki-article-heading"><p class="eyebrow">${esc(article.category)}</p><h1 id="article-title">${esc(article.title)}</h1><p class="lead">${esc(article.summary)}</p></header>${referenceSearch}${article.sections.map(section => `<section id="${section.id}"${sharedFilter && section.tables?.length && !section.paragraphs?.length && !section.lists?.length ? ' data-reference-section="article-reference"' : ''}><h2>${esc(section.title)}</h2>${sectionContent(section, sharedFilter)}</section>`).join('')}${article.catalog === 'bestiary' ? bestiaryHtml : ''}<aside class="wiki-note">Guidance follows the current UO:PvE configuration. Use the in-game panels for the latest requirements and rewards.</aside><section aria-labelledby="related-title"><h2 id="related-title">Related guides</h2><ul>${(article.related || []).map(slug => { const related = articles.find(other => other.slug === slug); return `<li><a href="${articleUrl(related)}">${esc(related.title)}</a></li>`; }).join('')}</ul><a class="text-link" href="/uopve/wiki/">← All player guides</a></section></article></div>`
    });
  }

  await save(`${base}downloads/`, {
    title: 'Public access & development status', description: 'UO:PvE is still in development. Public play and launcher downloads are not available yet.', active: 'downloads',
    content: `${breadcrumb('Availability')}<section class="page-heading wrap"><p class="eyebrow">IN DEVELOPMENT</p><h1>The realm is<br><em>still taking shape.</em></h1><p class="lead">${esc(availabilityMessage)}</p></section><section class="section wrap"><article class="panel"><h2>Not open to players yet</h2><p>Installation and connection instructions will be published when public access is ready. No opening date has been announced.</p><div class="actions">${button('/uopve/wiki/', 'Browse the player wiki →')}${button('/uopve/updates/', 'Read development updates →', true)}</div></article></section>`
  });

  await save(`${base}updates/`, {
    title: 'Updates & release notes', description: 'Follow UO:PvE gameplay fixes, client releases and player guides, with dated changes and development status.', active: 'updates',
    content: `${breadcrumb('Updates')}<section class="page-heading wrap"><p class="eyebrow">FROM THE REALM</p><h1>The latest<br><em>UO:PvE updates.</em></h1><p class="lead">Gameplay changes, client releases and player guides, gathered in one place.</p></section><section class="section wrap"><div class="wiki-tools" role="search" aria-label="Search updates"><label for="update-search">Find an update<input id="update-search" type="search" maxlength="150" placeholder="Try combat, housing, maps or wiki…"></label></div><p id="update-results" role="status" aria-live="polite">${updates.length} updates</p><div class="update-list">${updates.map(update => `<article class="update-card" id="${update.id}" data-update-entry data-search="${esc([update.title, update.category, update.summary, ...update.changes].join(' '))}"><div class="update-meta"><time datetime="${esc(update.changedAt || update.date)}">${updateDateLabel(update)}</time><span class="tag">${esc(update.category)}</span></div><h2>${esc(update.title)}</h2><p>${esc(update.summary)}</p><ul>${update.changes.map(change => `<li>${esc(change)}</li>`).join('')}</ul><a class="text-link" href="${esc(update.link)}">${esc(update.linkLabel)} →</a></article>`).join('')}</div><p id="update-empty" class="callout" hidden>No updates match that search. Try a shorter term or clear the search.</p><noscript><p class="callout">The full update history is visible here. Enable JavaScript to search it.</p></noscript></section>`
  });
  return { articles: articles.length, updates: updates.length, pages: articles.length + 5 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('Built UO:PvE:', await buildUopve());
}
