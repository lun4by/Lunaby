const consentService = require('../services/user/consentService');
const i18nManager = require('../services/i18n/i18nManager');
const logger = require('../utils/core/logger.js');
const emojis = require('../config/emojis.js');
const { getGuildLocale } = require('../utils/guild/guildLocale.js');

async function getInteractionTranslator(interaction) {
  let locale = 'vi';

  try {
    if (interaction.guildId) {
      locale = await getGuildLocale(interaction.guildId);
    }
  } catch (error) {
    logger.warn('consent_handler', `Failed to resolve locale for consent interaction: ${error.message}`);
  }

  return (key, options) => i18nManager.t(key, locale, options);
}

async function handleConsentInteraction(interaction) {
  if (!interaction.isButton()) return;

  const t = await getInteractionTranslator(interaction);

  const { customId, user } = interaction;

  // Lấy userId từ customId: consent_accept_{userId} hoặc consent_decline_{userId}
  const parts = customId.split('_');
  const targetUserId = parts[2]; // userId được nhúng trong customId
  const action = parts[1]; // accept hoặc decline

  if (!targetUserId) return;

  // Chặn người khác bấm consent của người khác
  if (user.id !== targetUserId) {
    return interaction.reply({
      content: `${emojis.error} ${t('system.consent_only_target_user')}`,
      ephemeral: true
    });
  }

  try {
    if (action === 'accept') {
      await consentService.handleConsentAccept(interaction, targetUserId);
    } else if (action === 'decline') {
      await consentService.handleConsentDecline(interaction, targetUserId);
    }
  } catch (error) {
    logger.error('consent_handler', `Error handling consent interaction for user ${targetUserId}:`, error);
    const errPayload = { content: `${emojis.error} ${t('system.consent_process_error')}`, ephemeral: true };
    const respond = interaction.replied || interaction.deferred
      ? interaction.followUp(errPayload)
      : interaction.reply(errPayload);
    await respond.catch(() => { });
  }
}

module.exports = {
  handleConsentInteraction
};
