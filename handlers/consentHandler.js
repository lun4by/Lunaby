const consentService = require('../services/consentService');
const logger = require('../utils/logger.js');


async function handleConsentInteraction(interaction) {
  if (!interaction.isButton()) return;

  const { customId, user } = interaction;
  const userId = user.id;

  try {
    if (customId === 'consent_accept') {
      await consentService.handleConsentAccept(interaction, userId);
    } else if (customId === 'consent_decline') {
      await consentService.handleConsentDecline(interaction, userId);
    }
  } catch (error) {
    logger.error('CONSENT_HANDLER', `Lỗi khi xử lý consent interaction cho user ${userId}:`, error);
    const errPayload = { content: 'Có lỗi xảy ra khi xử lý yêu cầu của bạn. Vui lòng thử lại sau!', ephemeral: true };
    const respond = interaction.replied || interaction.deferred
      ? interaction.followUp(errPayload)
      : interaction.reply(errPayload);
    await respond.catch(() => { });
  }
}

module.exports = {
  handleConsentInteraction
};
