const dialog = await assistant.waitForGump(0, 250);
if (!dialog) { await assistant.log("No gump observed."); return; }
await assistant.log(`Gump ${dialog.ServerSerial}; truncated: ${dialog.Truncated}`);
for (const text of dialog.Text.slice(0, 4)) await assistant.log(text);
