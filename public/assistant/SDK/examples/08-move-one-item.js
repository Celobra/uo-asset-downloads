const s = await assistant.snapshot();
if (!s.InGame || s.InventoryTruncated || s.HeldItem !== 0) return;
const destination = await assistant.alias("supplyBag");
const item = s.Items.find(i => i.Container === s.Player.Backpack &&
  i.OwnedInventory && i.Accessible && i.Movable && !i.IsContainer && i.Amount > 0);
if (!item) { await assistant.log("No eligible backpack stack is loaded."); return; }
const result = await assistant.moveItem(item.Serial, destination, 1);
await assistant.log(result.Message);
