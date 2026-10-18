import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';
import {renderAssistantHome} from '../tools/build-assistant.mjs';

test('Assistant homepage promotion is versioned, repeatable and preserves unrelated products', () => {
  const unrelated = '<section id="studio">Studio 0.33.12 and its existing installer</section><p>Orc-NPC-Roles</p><p>Archived UO Assistant 0.5.0</p>';
  const input = '<html><head></head><body><p>UO Assistant 0.6.1 and Studio 0.33.12 are available.</p><main id="library">' + unrelated + '</main></body></html>';
  const result = renderAssistantHome(input, {version:'0.7.1'});
  assert.equal(renderAssistantHome(result, {version:'0.7.1'}), result);
  assert.ok(result.includes(unrelated));
  assert.ok(result.includes('UO Assistant 0.7.1'));
  assert.ok(result.includes('/assistant/promo.css'));
  assert.ok(result.includes('Target the item. Choose the bag.'));
  assert.ok(result.includes('separate windows'));
  assert.ok(result.includes('/assistant/#target-setup'));
  assert.equal((result.match(/ASSISTANT_SPOTLIGHT_START/g) || []).length, 1);
  assert.doesNotMatch(result, /<script\b|\sstyle=|UO Assistant 0\.6\.1/);
});

test('The new Assistant tour uses actual controls and labels fixture limits explicitly', async () => {
  const page = await readFile(new URL('../data/assistant-page.html', import.meta.url), 'utf8');
  for (const text of ['Heal the patient you chose', 'Cure poison', 'Stop healing', 'Open pet controls', 'Open boat controls', 'Open custom controls', '.sacall', 'Casting &amp; convenience', 'Keep harmful and beneficial last targets separate', 'no account is logged in', 'not proof of recovery', 'synthetic pet data']) assert.ok(page.includes(text), text);
  assert.doesNotMatch(page, /pinned actions|Save and Run stay above scrolling|unchanged (?:in 0\.6\.1|0\.6\.0 client)|not rerun for this installer patch|C:[/\\]Users|G:[/\\]My Drive|Documents[/\\]ChatGPT/i);
  for (const image of ['uo-assistant-070.png','uo-assistant-070.ico','pet-healing-070.png','healing-watch-070.png','command-buttons-070.png','native-panels-070.png','casting-convenience-070.png','readability-070.png','targeting-choices-070.png']) {
    const info = await stat(new URL('../public/assistant/media/' + image, import.meta.url));
    assert.ok(info.size > 1000 && info.size < 2_000_000, image);
  }
});

test('Item setup explains direct saves, advanced drafts and current observed selection without claiming live results', async () => {
  const page = await readFile(new URL('../data/assistant-page.html', import.meta.url), 'utf8');
  for (const text of ['Pick it in game.', 'Target item to add', 'Target loot bag', 'type and exact colour',
    'Pick rule item type in game', 'Add matching rule', 'Pick protection item type in game', 'Target item to protect',
    'Target vendor', 'displayed quantity, price and keep limits', 'waiting for Add or Save',
    'Saving does not move items or enable a watch', 'a changed character session leaves saved rules unchanged',
    'The PDF manuals retain their 0.7.0 edition', 'the retained PDF files are unchanged', 'guide/Item-targeting.html'])
    assert.ok(page.includes(text), text);
  assert.doesNotMatch(page, /all 58 (?:tools|editors).{0,30}(?:target|select)|all numeric (?:fields|input).{0,30}removed|0\.7\.1 (?:complete |new )?PDF/i);
  for (const image of ['loot-targeting-071.png', 'protection-targeting-071.png', 'vendor-targeting-071.png', 'counter-targeting-071.png', 'ground-targeting-071.png']) {
    const info = await stat(new URL('../public/assistant/media/' + image, import.meta.url));
    assert.ok(info.size > 10_000 && info.size < 2_000_000, image);
  }
});
