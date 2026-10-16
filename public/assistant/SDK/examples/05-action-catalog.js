const s = await assistant.snapshot();
const actions = s.ActionsAvailable.slice(0, 12);
for (const action of actions) {
  await assistant.log(`${action.Group}: ${action.Name} (${action.Kind} ${action.Id})`);
}
