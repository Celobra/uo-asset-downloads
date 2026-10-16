// Read only. Optional Graphic and Hue filters can be combined with Name.
const found = await assistant.findItems({ Name: "axe", Scope: "Owned", Limit: 20 });
await assistant.log(`Matches: ${found.Items.length}; complete: ${found.Complete}`);
for (const item of found.Items) await assistant.log(`${item.Name}: serial ${item.Serial}, graphic ${item.Graphic}, hue ${item.Hue}`);
