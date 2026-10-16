try {
  const result = await assistant.openBackpack();
  await assistant.log(`${result.Accepted}: ${result.Message}`);
} catch (error) {
  await assistant.log(`Backpack request stopped: ${error.message}`);
}
