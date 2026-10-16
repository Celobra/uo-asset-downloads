const count = await assistant.count(0x0E21, null);
await assistant.log(`Loaded bandages: ${count.Amount}; complete: ${count.Complete}`);
if (!count.Complete) await assistant.log(count.Message);
