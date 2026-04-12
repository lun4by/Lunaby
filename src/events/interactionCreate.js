const { Events } = require("discord.js");
const { handleCommand } = require("../handlers/commandHandler");
const { handleConsentInteraction } = require("../handlers/consentHandler");
const { handleResetdbInteraction } = require("../handlers/resetdbHandler");
const { ensureInteractionAllowed } = require("./eventRuntime");
const logger = require("../utils/core/logger.js");

function setupInteractionCreateEvent(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (!(await ensureInteractionAllowed(interaction))) {
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
      logger.error("interaction_event", "Error handling interaction:", error);
    }
  });

  logger.info("events", "Registered event: InteractionCreate");
}

module.exports = { setupInteractionCreateEvent };

