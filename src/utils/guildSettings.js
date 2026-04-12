const MariaModDB = require('../services/database/MariaModDB.js');
const { invalidateGuildLocaleCache } = require('./guildLocale.js');

async function updateGuildSettingsAndInvalidate(guildId, settings) {
  await MariaModDB.updateGuildSettings(guildId, settings);
  invalidateGuildLocaleCache(guildId);
}

module.exports = {
  updateGuildSettingsAndInvalidate,
};