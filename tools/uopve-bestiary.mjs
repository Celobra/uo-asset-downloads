const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const label = value => String(value || '').replace(/^(?:random_|spawn_|set_)/, '').replaceAll('_', ' ').replaceAll('%s', 's');
const shown = value => value === null || value === undefined || value === '' ? 'Not specified' : String(value);
const safeId = value => String(value).toLowerCase().replace(/[^a-z0-9-]/g, '-');
const list = values => values?.length ? `<ul>${values.map(value => `<li>${esc(label(value))}</li>`).join('')}</ul>` : '<p>No explicit entries in this definition.</p>';
const statsTable = (title, entries) => `<div class="reference-table" tabindex="0" role="region" aria-label="${esc(title)}"><table><caption>${esc(title)}</caption><tbody>${entries.map(([name, value]) => `<tr><th scope="row">${esc(name)}</th><td>${esc(shown(value))}</td></tr>`).join('')}</tbody></table></div>`;

export function renderBestiary(data) {
  const { creatures, lootPools = [], spawnGroups = [] } = data;
  if (!Array.isArray(creatures) || !creatures.length || new Set(creatures.map(c => safeId(c.id))).size !== creatures.length) throw Error('Bestiary needs unique safe creature anchors.');
  const groups = [...new Set(creatures.map(c => c.category || 'Other'))].sort();
  const pools = new Map(lootPools.map(pool => [pool.id, pool]));
  const spawns = new Map(spawnGroups.map(group => [group.id, group]));
  const neededPools = new Set();
  function collectPool(id) {
    if (neededPools.has(id) || !pools.has(id)) return;
    neededPools.add(id);
    for (const drop of pools.get(id).drops || []) {
      for (const reference of drop.poolReferences || []) collectPool(reference);
    }
  }
  for (const creature of creatures) for (const id of creature.lootPools || []) collectPool(id);
  const catalog = [...creatures].sort((a,b) => Number(a.civilian) - Number(b.civilian) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)).map(creature => {
    const title = creature.name || label(creature.id);
    const category = creature.category || 'Other';
    const difficulty = creature.difficulty?.value === null || creature.difficulty?.value === undefined ? 'No fixed base rating' : `${creature.difficulty.value}/100`;
    const search = [title, creature.id, category, creature.family, creature.role, difficulty, ...Object.keys(creature.skills || {}), ...(creature.abilities || []), ...(creature.loot || [])].join(' ');
    const stats = Object.entries(creature.stats || {}).map(([key,value]) => [{ str:'Strength', dex:'Dexterity', int:'Intelligence', hits:'Health', stam:'Stamina', mana:'Mana' }[key] || key, value]);
    stats.push(['Base damage',creature.damage],['Base armour',creature.armor],['Taming difficulty',creature.taming]);
    const resistance = Object.entries(creature.resistances || {}).map(([key,value]) => [key[0].toUpperCase() + key.slice(1),value]);
    const poolLinks = (creature.lootPools || []).filter(id => neededPools.has(id)).map(id => `<a href="#loot-${safeId(id)}">${esc(label(pools.get(id)?.name || id))}</a>`).join(', ');
    const spawnNames = (creature.spawnGroups || []).map(id => label(spawns.get(id)?.name || id));
    return `<details class="creature-card" id="creature-${safeId(creature.id)}" data-bestiary-entry data-category="${esc(category)}" data-search="${esc(search)}"><summary><span class="creature-label"><span>${esc(title)}</span><small class="creature-family">${esc(creature.family || category)}</small></span><span class="creature-rating">${esc(difficulty)}</span></summary><div class="creature-content"><p class="small">${esc(creature.family || category)} · ${esc(creature.role || 'Creature definition')}</p><p>${esc(creature.availability || 'Registered definition; individual world placement varies.')}</p><div class="creature-stats">${statsTable(title + ' statistics',stats)}${statsTable(title + ' resistances',resistance)}</div>${creature.skills && Object.keys(creature.skills).length ? statsTable(title + ' skills',Object.entries(creature.skills)) : ''}<h3>Abilities and behavior</h3>${list(creature.abilities)}<h3>Corpse loot</h3>${list(creature.loot)}${poolLinks ? `<p>Loot selections: ${poolLinks}</p>` : ''}<p>${creature.scalingGoldEligible ? 'Eligible for the difficulty-scaled gold system, subject to ownership, summon and other eligibility checks.' : 'No difficulty-scaled gold eligibility is established for this definition.'}</p><h3>Carving resources</h3>${list(creature.carvingResources)}${creature.equipment?.length ? `<h3>Carried equipment</h3>${list(creature.equipment)}<p>Carried or protected equipment is separate from guaranteed corpse loot.</p>` : ''}${creature.taming !== null && creature.taming !== undefined ? `<h3>Companion details</h3><p>${esc(creature.tamingNotes || 'Native taming checks still apply.')}</p><p>Food: ${esc(shown(label(creature.food)))}. ${creature.followerSlots ? `Species slot value: ${esc(creature.followerSlots)}; this does not establish a player follower cap.` : ''}</p>` : ''}${spawnNames.length ? `<h3>Registered spawn pools</h3>${list(spawnNames)}<p>A pool reference does not establish a currently active spawn at every named location.</p>` : ''}${creature.notes?.length ? `<h3>Reading this entry</h3>${list(creature.notes)}` : ''}</div></details>`;
  }).join('\n');
  const poolDetails = [...neededPools].sort().map(id => {
    const pool = pools.get(id);
    return `<details class="loot-pool" id="loot-${safeId(id)}"><summary>${esc(label(pool.name || id))}</summary>${list((pool.drops || []).map(drop => drop.display || label(drop.declaration)))}</details>`;
  }).join('\n');
  return `<section id="creature-catalogue"><h2>Creature and NPC catalogue</h2><p>${creatures.length.toLocaleString('en-GB')} registered definitions. Search by name, type or ability, then open a creature to read its statistics and loot. Difficulty is the configured base score where available; live instance adjustments can change it. Not specified means no explicit value is provided, rather than zero. Elemental resistance values are listed as data; the active combat profile determines which values affect damage.</p><div class="wiki-tools"><label for="bestiary-search">Find a creature<input id="bestiary-search" type="search" maxlength="150" placeholder="Try dragon, lich, taming or poison…"></label><label for="bestiary-category">Creature category<select id="bestiary-category"><option value="all">All categories</option>${groups.map(group => `<option value="${esc(group)}">${esc(group)}</option>`).join('')}</select></label></div><p id="bestiary-results" role="status" aria-live="polite">${creatures.length} creatures</p><div class="creature-list">${catalog}</div><p id="bestiary-empty" class="callout" hidden>No creatures match. Clear the search or choose All categories.</p><noscript><p>Every creature is available below. Open an entry to read its statistics and loot.</p></noscript></section><section id="loot-selections"><h2>Referenced loot selections</h2><p>These are the selection pools referenced by the creature catalogue. Random choices and optional quantities are not guaranteed drops. Named pools may contain compatibility items whose current acquisition depends on the shard’s loot rules.</p>${poolDetails}</section>`;
}
