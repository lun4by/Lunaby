const { Events } = require("discord.js");
const { handleCommand, loadCommands } = require("../handlers/commandHandler");
const { handleConsentInteraction } = require("../handlers/consentHandler");
const { handleResetdbInteraction } = require("../handlers/resetdbHandler");
const MariaModDB = require("../services/database/MariaModDB");
const i18nManager = require("../services/i18n/i18nManager");
const {
  notifyBlacklistedGuildAndLeave,
  notifyBlacklistedUser,
  shouldBlockGuild,
  shouldBlockUser,
} = require("../utils/blacklistUtils");
const logger = require("../utils/logger.js");

async function handleWelcomeDonateButton(interaction, client) {
  if (!client.commands?.size) {
    loadCommands(client);
  }

  const donateCommand = client.commands?.get('donate');
  if (!donateCommand) {
    return interaction.reply({ content: 'Khong tim thay lenh donate.', ephemeral: true });
  }

  let locale = 'vi';
  if (interaction.guildId) {
    const settings = await MariaModDB.getGuildSettings(interaction.guildId);
    locale = settings?.language || 'vi';
  }
  interaction.t = (key, options) => i18nManager.t(key, locale, options);

  if (interaction.guildId) {
    const isDisabled = await MariaModDB.isCommandDisabled(interaction.guildId, interaction.channelId, 'donate');
    if (isDisabled) {
      return interaction.reply({ content: interaction.t('system.command_disabled_in_channel'), ephemeral: true });
    }
  }

  await donateCommand.execute(interaction);
}

function setupInteractionCreateEvent(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      const blockedGuild = interaction.guild ? await shouldBlockGuild(interaction.guild) : null;
      if (blockedGuild) {
        await notifyBlacklistedGuildAndLeave(interaction.guild, blockedGuild.reason);
        return;
      }

      const blockedUser = await shouldBlockUser(interaction.user);
      if (blockedUser) {
        await notifyBlacklistedUser(interaction.user, blockedUser.reason);
        return;
      }

      if (interaction.isChatInputCommand()) {
        await handleCommand(interaction, client);
      } else if (interaction.isButton()) {
        if (interaction.customId.startsWith('consent_')) {
          await handleConsentInteraction(interaction);
        } else if (interaction.customId.startsWith('reset_')) {
          await handleResetdbInteraction(interaction);
        } else if (interaction.customId === 'guild_welcome_donate') {
          await handleWelcomeDonateButton(interaction, client);
        }
      }
    } catch (error) {
      logger.error("interaction_event", "Error handling interaction:", error);
    }
  });

  logger.info("events", "Registered event: InteractionCreate");
}

module.exports = { setupInteractionCreateEvent };