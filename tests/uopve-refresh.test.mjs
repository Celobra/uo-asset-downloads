import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const data=JSON.parse(await readFile(new URL('../data/uopve.json',import.meta.url),'utf8'));
const bestiary=JSON.parse(await readFile(new URL('../data/uopve-bestiary.json',import.meta.url),'utf8'));
const guide=slug=>{const article=data.articles.find(a=>a.slug===slug);assert.ok(article,slug);return article;};
const rows=article=>article.sections.flatMap(s=>(s.tables||[]).flatMap(t=>t.rows));

test('The current wiki edition exposes the new guides while retaining closed public access',async()=>{
  assert.equal(data.wikiUpdated,'2026-10-16');
  assert.equal(data.updates[0].id,'wiki-progression-refresh-2026-10-16');
  assert.equal(data.availability.publicPlay,false);
  const html=await readFile(new URL('../public/uopve/wiki/index.html',import.meta.url),'utf8');
  assert.ok(html.includes('<time datetime="2026-10-16">16 October 2026</time>'));
  for(const slug of ['quest-catalogue','quest-givers','necromancy','chivalry','crafting-workshops','custom-recipes','ticket-exchange','class-artisan','lasting-progression','town-contracts','dungeon-expeditions','armor-display-mannequins']){
    guide(slug);assert.ok(html.includes(`href="/uopve/wiki/${slug}/"`));
  }
  const rules=JSON.stringify(guide('combat-rules'));
  assert.match(rules,/51 skills/);
  assert.doesNotMatch(rules,/Necromancy, Chivalry, Focus.*not enabled/);
});

test('Quest and crafting reference totals agree across the player guides',()=>{
  const quests=guide('quest-catalogue');
  for(const [id,count]of [['gathering',35],['hunts',45],['escorts',20]])assert.equal(quests.sections.find(s=>s.id===id).tables[0].rows.length,count);
  assert.equal(rows(quests).length,136);
  assert.equal(new Set(rows(quests).map(r=>r[0])).size,135,'One story and its repeatable escort intentionally share the source title News for the Keep');
  const duplicateTitles=rows(quests).map(r=>r[0]).filter((title,index,titles)=>titles.indexOf(title)!==index);
  assert.deepEqual(duplicateTitles,['News for the Keep']);
  assert.equal(quests.sections.find(s=>s.id==='repeatable-contracts').tables[0].rows.length,36);
  assert.equal(rows(guide('quest-givers')).length,32);
  const counts={alchemy:47,blacksmithing:682,bowcraft:27,carpentry:144,cartography:4,cooking:13,inscription:84,tailoring:76,tinkering:70};
  assert.equal(Object.entries(counts).reduce((sum,[skill,count])=>{assert.equal(rows(guide('crafting-'+skill)).length,count,skill);return sum+count;},0),1147);
  const totals=rows(guide('crafting-workshops'));
  assert.equal(totals.reduce((n,r)=>n+Number(r[1]),0),431);
  assert.equal(totals.reduce((n,r)=>n+Number(r[2]),0),1147);
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
  assert.equal(bestiary.creatures.length,1149);
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
  const worg=bestiary.creatures.find(c=>c.id==='c_worg');assert.equal(worg.taming,'50.0');assert.equal(worg.damage,'5–10');
  const display=bestiary.creatures.find(c=>c.id==='c_uopve_display_mannequin');assert.equal(display.role,'Protected house display');assert.equal(display.taming,null);assert.equal(display.scalingGoldEligible,false);
});

test('Artisan is the tenth permanent class and its crafting benefits retain recipe requirements',()=>{
  const choices=guide('classes-and-talents').sections.find(s=>s.id==='choice');
  assert.equal(choices.tables[0].rows.length,10);
  assert.deepEqual(choices.tables[0].rows.find(r=>r[0]==='Artisan').slice(2),['None; all five passive']);
  const artisan=guide('class-artisan');
  assert.deepEqual(artisan.sections.find(s=>s.id==='talents').tables[0].rows.map(r=>r[0]),['Steady Hands','Careful Recovery','Masterwork','Efficient Workflow','Practical Experience']);
  const text=JSON.stringify(artisan);
  assert.match(text,/50\.0 primary crafting skill/);assert.match(text,/ten-second/);assert.match(text,/replaces the smaller GM crafting award rather than stacking/);
  assert.match(text,/45 XP, or 72 with rank-12/);assert.match(text,/0\.1-second minimum/);assert.match(text,/Class choice is permanent/);
  assert.match(JSON.stringify(guide('combat-rules')),/ten-class talent system/);
});

test('Progression guides preserve the source XP thresholds, pet shares and new roles',()=>{
  const xp=guide('character-levels-and-xp').sections.find(s=>s.id==='levels').tables[0].rows;
  for(const [level,total]of [['20','19,000'],['50','518,500'],['80','3,196,000'],['100','7,151,000']])assert.equal(xp.find(r=>r[0]===level)[1],total);
  const pet=guide('pet-progression'),thresholds=pet.sections.find(s=>s.id==='thresholds').tables[0].rows;
  assert.deepEqual(thresholds.find(r=>r[0]==='10').slice(1),['285,000','100,000','+18']);
  assert.deepEqual(thresholds.find(r=>r[0]==='20').slice(1),['2,470,000','Maximum level','+38']);
  const text=JSON.stringify(pet);
  assert.match(text,/damage-based share/);assert.match(text,/no pet-training XP/);assert.match(text,/within 120 seconds/);assert.match(text,/five-mana pet cost/);assert.match(text,/ten-second cooldown/);assert.match(text,/15 HP per heal/);
  assert.deepEqual(pet.sections.find(s=>s.id==='perks').tables[0].rows.map(r=>r[0]),['Striker','Guardian','Support']);
  assert.match(text,/Previously learned damage, defense and self-leech/);assert.match(text,/ownership changes|Changing a pet’s owner/);
});

test('Town orders, expeditions and journey material choices retain separate requirements and rewards',()=>{
  const towns=guide('town-contracts');
  assert.equal(towns.sections.find(s=>s.id==='towns').tables[0].rows.length,12);
  assert.deepEqual(towns.sections.find(s=>s.id==='orders').tables[0].rows,[['Supplies','Neutral: 0','2','1 hour'],['Patrol','Friendly: 51','4','3 hours'],['Trusted journey','Honored: 251','8','6 hours']]);
  assert.match(JSON.stringify(towns),/751.*50 repeatable contracts/);
  const expeditions=guide('dungeon-expeditions');
  assert.deepEqual(expeditions.sections.find(s=>s.id==='start').tables[0].rows.map(r=>r[0]),['Deceit','Despise','Destard','Covetous','Shame','Wrong','Hythloth','Fire Dungeon']);
  assert.deepEqual(expeditions.sections.find(s=>s.id==='tiers').tables[0].rows,[['1','20','1','0','2'],['2','40','2','1','4'],['3','60','3','3','6']]);
  assert.match(JSON.stringify(expeditions),/successfully unlock/);assert.match(JSON.stringify(expeditions),/opened|open it yourself/);assert.match(JSON.stringify(expeditions),/another player|somebody else/);
  assert.deepEqual(expeditions.sections.find(s=>s.id==='caches').tables[0].rows.map(r=>r[1]),['30.0','50.0','70.0','85.0','100.0']);
  const milestones=guide('lasting-progression').sections.find(s=>s.id==='material-rewards').tables[0].rows;
  assert.deepEqual(milestones.map(r=>r[1]),['Every 500 eligible catches','Every 10 recoveries','Every 250 outputs','Each completed tier, including repeats']);
  assert.match(JSON.stringify(guide('lasting-progression')),/Pending choices survive logout and world saves/);
});

test('All 24 recipe discoveries and house display limits remain visible to players',()=>{
  const discoveries=guide('custom-recipes');
  assert.equal(discoveries.sections.find(s=>s.id==='bard-pieces').tables[0].rows.length,8);
  const projects=discoveries.sections.find(s=>s.id==='collectible-projects').tables[0].rows;
  assert.equal(projects.length,16);assert.equal(new Set(projects.map(r=>r[0])).size,16);
  assert.deepEqual(projects.find(r=>r[0]==='Unobtainium Memorial Statue').slice(1),['Tinkering','100.0','30 Unobtainium Ingot; 6 High quality granite']);
  assert.match(JSON.stringify(discoveries),/All 24 discoveries/);assert.match(JSON.stringify(discoveries),/does not increase the chance/);
  const workshop=JSON.stringify(guide('crafting-workshops'));assert.match(workshop,/Supplies lists/);assert.match(workshop,/may consume any matching cloth item-type stack/);assert.match(workshop,/Fixed custom recipes keep their exact special ingredients/);
  const display=JSON.stringify(guide('armor-display-mannequins'));assert.match(display,/do not add a crafting recipe, shop listing or reward price/);assert.match(display,/Only the current house owner and co-owners/);assert.match(display,/current house owner’s bank/);assert.match(display,/original item moves onto the display/);
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
