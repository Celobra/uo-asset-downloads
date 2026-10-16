const s = await assistant.snapshot();
const after = s.Journal.reduce((last, line) => Math.max(last, line.Sequence), 0);
const observed = await assistant.waitForJournal("finished", 250, after);
await assistant.log(observed ? "A new matching line arrived." : "No new matching line.");
