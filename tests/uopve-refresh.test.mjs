import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const data=JSON.parse(await readFile(new URL('../data/uopve.json',import.meta.url),'utf8'));
const bestiary=JSON.parse(await readFile(new URL('../data/uopve-bestiary.json',import.meta.url),'utf8'));
const guide=slug=>{const article=data.articles.find(a=>a.slug===slug);assert.ok(article,slug);return article;};
const rows=article=>article.sections.flatMap(s=>(s.tables||[]).flatMap(t=>t.rows));

test('The current wiki edition exposes the new guides while retaining closed public access',async()=>{
  assert.equal(data.wikiUpdated,'2026-10-09');
  assert.equal(data.updates[0].id,'wiki-development-refresh-2026-10-09');
  assert.equal(data.availability.publicPlay,false);
  const html=await readFile(new URL('../public/uopve/wiki/index.html',import.meta.url),'utf8');
  assert.ok(html.includes('<time datetime="2026-10-09">9 October 2026</time>'));
  for(const slug of ['quest-catalogue','quest-givers','necromancy','chivalry','crafting-workshops','custom-recipes','ticket-exchange']){
    guide(slug);assert.ok(html.includes(`href="/uopve/wiki/${slug}/"`));
  }
  const rules=JSON.stringify(guide('combat-rules'));
  assert.match(rules,/51 skills/);
  assert.doesNotMatch(rules,/Necromancy, Chivalry, Focus.*not enabled/);
});

test('Quest and crafting reference totals agree across the player guides',()=>{
  const quests=guide('quest-catalogue');
  for(const [id,count]of [['gathering',35],['hunts',45],['escorts',20]])assert.equal(quests.sections.find(s=>s.id===id).tables[0].rows.length,count);
  assert.equal(new Set(rows(quests).map(r=>r[0])).size,100);
  assert.equal(rows(guide('quest-givers')).length,32);
  const counts={alchemy:47,blacksmithing:678,bowcraft:27,carpentry:140,cartography:4,cooking:13,inscription:84,tailoring:72,tinkering:66};
  assert.equal(Object.entries(counts).reduce((sum,[skill,count])=>{assert.equal(rows(guide('crafting-'+skill)).length,count,skill);return sum+count;},0),1131);
  const totals=rows(guide('crafting-workshops'));
  assert.equal(totals.reduce((n,r)=>n+Number(r[1]),0),415);
  assert.equal(totals.reduce((n,r)=>n+Number(r[2]),0),1131);
  const tickets=guide('ticket-exchange');
  for(const [id,count]of [['cloth',10],['ingots',10],['ethereals',8]])assert.equal(tickets.sections.find(s=>s.id===id).tables[0].rows.length,count);
});

test('All enabled school spells are recorded and scroll limitations stay visible',()=>{
  for(const [slug,count]of [['necromancy',17],['chivalry',10]]){
    const spells=guide(slug).sections.find(s=>s.id==='spell-reference').tables[0].rows;
    assert.equal(spells.length,count);assert.equal(new Set(spells.map(r=>r[0])).size,count);
  }
  assert.equal(rows(guide('skills-and-stats')).length,51);
  assert.match(JSON.stringify(guide('crafting-inscription')),/Exorcism.*verif/i);
  assert.match(JSON.stringify(guide('crafting-workshops')),/Magery scrolls also need/);
});

test('Creature and spawn identities resolve, retired definitions stay removed, and escorts retain their role',()=>{
  assert.equal(bestiary.creatures.length,1147);
  assert.equal(bestiary.spawnGroups.length,478);
  const aliases=new Set(bestiary.creatures.flatMap(c=>c.aliases.map(id=>id.toLowerCase())));
  const groups=new Set(bestiary.spawnGroups.map(g=>g.id.toLowerCase()));
  for(const group of bestiary.spawnGroups){assert.doesNotMatch(group.id,/trammel/i);for(const member of group.members)assert.ok(aliases.has(member.id.toLowerCase())||groups.has(member.id.toLowerCase()),`${group.id}: ${member.id}`);}
  for(const creature of bestiary.creatures)for(const group of creature.spawnGroups)assert.ok(groups.has(group.toLowerCase()),`${creature.id}: ${group}`);
  for(const id of ['0112','02ef','c_archaeosaurus','c_blood_fox','c_skeletal_cat','c_capybara_mount','c_capybara_baby','c_dog_malamut','c_dog_terier'])assert.ok(!bestiary.creatures.some(c=>c.id===id),id);
  assert.ok(aliases.has('c_boar'));assert.ok(aliases.has('0122'));
  for(const id of ['c_pve_quest_escort_traveler','c_pve_quest_escort_traveler_female']){
    const creature=bestiary.creatures.find(c=>c.id===id);assert.equal(creature.role,'Private escort companion');assert.match(creature.abilities.join(' '),/Vulnerable/);assert.doesNotMatch(creature.abilities.join(' '),/Protected town NPC/);
  }
});

test('General equipment pools resolve to the current classic armor and weapon outcomes',()=>{
  const pools=new Map(bestiary.lootPools.map(p=>[p.id,p]));
  const leaves=(id,seen=new Set())=>{
    assert.ok(!seen.has(id),`Cyclic pool: ${id}`);const pool=pools.get(id);if(!pool)return new Set([id]);
    const next=new Set([...seen,id]),result=new Set();
    for(const drop of pool.drops){const selection=drop.selection;const ids=selection?.options?.length?selection.options.map(o=>o.id):selection?.id?[selection.id]:drop.poolReferences||[];for(const child of ids)for(const item of leaves(child,next))result.add(item);}
    return result;
  };
  const armor=leaves('random_armor_all'),weapons=leaves('random_weapon_all');
  assert.equal(armor.size,47);assert.equal(weapons.size,40);
  for(const id of [...armor,...weapons])assert.doesNotMatch(id,/gargish|dragon_scale|elven|japanese|hammer_smith|hammer_sledge|pickaxe|spiked_shorts/);
});
