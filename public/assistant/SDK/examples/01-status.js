const s = await assistant.snapshot();
await assistant.log(s.InGame
  ? `${s.Player.Name}: ${s.Player.Hits}/${s.Player.HitsMax} HP`
  : "Enter the world before running gameplay scripts.");
await assistant.log(`Draw FPS ${s.Performance.DrawFps}`);
