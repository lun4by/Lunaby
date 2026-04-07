const { Events } = require("discord.js");
const { handleCommand } = require("../handlers/commandHandler");
const { handleConsentInteraction } = require("../handlers/consentHandler");
const { handleResetdbInteraction } = require("../handlers/resetdbHandler");
const {
  notifyBlacklistedGuildAndLeave,
  notifyBlacklistedUser,
  shouldBlockGuild,
  shouldBlockUser,
} = require("../utils/blacklistUtils");
const logger = require("../utils/logger.js");

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
        }
      }
    } catch (error) {
      // TEMP DEBUG: hard console logging to bypass logger filters; remove after interaction bug is identified.
      console.error('[TEMP INTERACTION ERROR]', {
        type: interaction.type,
        isChatInputCommand: interaction.isChatInputCommand?.() ?? false,
        isButton: interaction.isButton?.() ?? false,
        commandName: interaction.commandName,
        customId: interaction.customId,
        userId: interaction.user?.id,
        userTag: interaction.user?.tag,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
      });
      console.error(error?.stack || error);

      logger.error("INTERACTION_EVENT", "Error handling interaction:", error);
    }
  });

  logger.info("EVENTS", "Registered event: InteractionCreate");
}

module.exports = { setupInteractionCreateEvent };
