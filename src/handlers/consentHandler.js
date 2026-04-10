const consentService = require('../services/user/consentService');
const logger = require('../utils/logger.js');
const emojis = require('../config/emojis.js');


async function handleConsentInteraction(interaction) {
  if (!interaction.isButton()) return;

  const { customId, user } = interaction;

  // Lấy userId từ customId: consent_accept_{userId} hoặc consent_decline_{userId}
  const parts = customId.split('_');
  const targetUserId = parts[2]; // userId được nhúng trong customId
  const action = parts[1]; // accept hoặc decline

  if (!targetUserId) return;

  // Chặn người khác bấm consent của người khác
  if (user.id !== targetUserId) {
    return interaction.reply({
      content: `${emojis.error} Bạn không thể thao tác consent của người khác.`,
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
    logger.error('CONSENT_HANDLER', `Error handling consent interaction for user ${targetUserId}:`, error);
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