const s = await assistant.snapshot();
if (!s.InGame) return;
await assistant.openMap();
await assistant.mapWaypoint(s.Player.X, s.Player.Y, "Current location");
