const me = await assistant.alias("self");
const friend = await assistant.isFriend(me);
await assistant.log(`Self serial ${me}; saved friend: ${friend}`);
