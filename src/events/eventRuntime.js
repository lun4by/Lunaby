const i18nManager = require('../services/i18n/i18nManager');
const {
  notifyBlacklistedGuildAndLeave,
  notifyBlacklistedUser,
  shouldBlockGuild,
  shouldBlockUser,
} = require('../utils/discord/blacklistUtils');
const { getCachedGuildSettings } = require('../utils/guild/guildLocale.js');

const DEFAULT_LOCALE = 'vi';

function bindTranslator(target, locale = DEFAULT_LOCALE) {
  target.t = (key, options) => i18nManager.t(key, locale, options);
  return locale;
}

async function ensureInteractionAllowed(interaction) {
  const blockedGuild = interaction.guild ? await shouldBlockGuild(interaction.guild) : null;
  if (blockedGuild) {
    await notifyBlacklistedGuildAndLeave(interaction.guild, blockedGuild.reason);
    return false;
  }

  const blockedUser = await shouldBlockUser(interaction.user);
  if (blockedUser) {
    await notifyBlacklistedUser(interaction.user, blockedUser.reason);
    return false;
  }

  return true;
}

async function resolveMessageContext(message) {
  const [guildSettings, blockedGuild, blockedUser] = await Promise.all([
    message.guildId ? getCachedGuildSettings(message.guildId) : Promise.resolve(null),
    shouldBlockGuild(message.guild),
    shouldBlockUser(message.author),
  ]);

  const locale = bindTranslator(message, guildSettings?.language || DEFAULT_LOCALE);

  return {
    blockedGuild,
    blockedUser,
    guildSettings,
    locale,
  };
}

async function ensureMessageAllowed(message, context) {
  if (context.blockedGuild) {
    await notifyBlacklistedGuildAndLeave(message.guild, context.blockedGuild.reason);
    return false;
  }

  if (context.blockedUser) {
    await notifyBlacklistedUser(message.author, context.blockedUser.reason);
    return false;
  }

  return true;
}

module.exports = {
  bindTranslator,
  ensureInteractionAllowed,
  ensureMessageAllowed,
  resolveMessageContext,
};

