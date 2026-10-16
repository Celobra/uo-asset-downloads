const s = await assistant.snapshot();
if (!s.InGame || s.Player.Dead) return;
const heal = s.ActionsAvailable.find(a =>
  a.Kind === "CastSpell" && a.Name.toLowerCase() === "heal");
if (!heal) { await assistant.log("Heal is not in this shard's action catalog."); return; }
const result = await assistant.castSpell(heal.Id);
if (!result.Accepted) { await assistant.log(result.Message); return; }
if (await assistant.waitForTarget(3000)) {
  await assistant.targetSelf();
} else {
  await assistant.log("No new target arrived; no target reply sent.");
}
