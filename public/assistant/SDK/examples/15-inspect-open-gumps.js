// Read only. Optional Name, Type, Graphic, Hue, LocalSerial and ServerSerial filters.
let offset = 0, total = 0, partial = false;
for (;;) {
    const page = await assistant.findGumps({ Offset: offset });
    total += page.Gumps.length; partial ||= page.Truncated;
    for (const gump of page.Gumps) {
        // At most 32 lines; all remaining results still contribute to the count.
        if (total <= 32) await assistant.log(`${gump.Type}: local ${gump.LocalSerial}, server ${gump.ServerSerial}, ${gump.Controls.length} controls; partial: ${gump.Truncated}`);
    }
    if (page.NextOffset === null) break;
    offset = page.NextOffset;
}
await assistant.log(`Open windows found: ${total}; partial: ${partial}. Inspection does not grant a reply lease.`);
