for (let i = 0; i < 3; i++) {
  const s = await assistant.snapshot();
  if (!s.InGame || !s.Connected) break;
  const percent = s.Player.HitsMax > 0
    ? Math.round(100 * s.Player.Hits / s.Player.HitsMax) : 0;
  await assistant.log(`Sample ${i + 1}: ${percent}% HP`);
  await assistant.sleep(250);
}
