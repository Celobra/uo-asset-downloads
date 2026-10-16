// Read only. Change Kind to "Cave", "Land", "Static" or "Any" as needed.
let query = { Kind: "Tree", Radius: 12 };
let count = 0, missing = 0, truncated = false;
for (;;) {
    const page = await assistant.scanTiles(query);
    count += page.Tiles.length; missing += page.UnloadedTiles; truncated ||= page.Truncated;
    if (page.NextOffset === null) break;
    query = { ...query, Map: page.Map, X: page.X, Y: page.Y, Offset: page.NextOffset };
}
await assistant.log(`Loaded matches: ${count}; unloaded cells: ${missing}; limited: ${truncated}`);
