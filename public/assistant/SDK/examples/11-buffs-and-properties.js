const buffs = await assistant.buffs();
await assistant.log(`Loaded buffs: ${buffs.length}`);
const s = await assistant.snapshot();
const item = s.Items.find(i => i.OwnedInventory && i.Accessible);
if (item) {
  const detail = await assistant.properties(item.Serial);
  await assistant.log(detail
    ? `Properties complete: ${detail.PropertiesComplete}`
    : "No properties loaded.");
}
