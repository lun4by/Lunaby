const { ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const mariaClient = require('../database/mariaClient');
const logger = require('../../utils/core/logger.js');
const { handlePermissionError, sendEmbedWithFallback, isMissingPermissionError } = require('../../utils/discord/permissionUtils');

const { createContainer } = require('../../utils/discord/builderFactory');
class ConsentService {
  async hasUserConsented(userId) {
    try {
      const rows = await mariaClient.query('SELECT consented FROM user_consents WHERE user_id = ? LIMIT 1', [userId]);
      return rows.length > 0 ? Boolean(rows[0].consented) : false;
    } catch (error) {
      logger.error('consent', `Error while checking consent for user ${userId}:`, error);
      return false;
    }
  }

  createConsentEmbed(user) {
    const consentContainer = createContainer()
      .setAccentColor(0x5865F2)
      .addSectionComponents((section) =>
        section
          .addTextDisplayComponents(
            (textDisplay) => textDisplay.setContent(`## Chào mừng bạn đến với Lunaby AI`),
            (textDisplay) => textDisplay.setContent(`Xin chào **${user.username}**!`)
          )
          .setThumbnailAccessory((thumbnail) =>
            thumbnail.setURL(user.displayAvatarURL({ extension: 'png', size: 512 }))
          )
      )
      .addTextDisplayComponents((textDisplay) =>
        textDisplay.setContent(
          `Mình là **Lunaby**, AI assistant sẵn sàng hỗ trợ bạn.\n\n` +
          `Để sử dụng dịch vụ, bạn cần đồng ý với các điều khoản sau:\n\n` +
          `**Dữ liệu được thu thập**\n` +
          `> - Tin nhắn trò chuyện\n` +
          `> - Thông tin cơ bản (username, ID)\n` +
          `> - Dữ liệu XP và level\n\n` +
          `**Cam kết bảo mật**\n` +
          `> - Dữ liệu được mã hóa và bảo mật\n` +
          `> - Không chia sẻ với bên thứ ba\n` +
          `> - Có thể xóa dữ liệu bất cứ lúc nào\n\n` +
          `**Bạn có đồng ý sử dụng dịch vụ Lunaby AI không?**`
        )
      )
      .addSeparatorComponents((separator) => separator)
      .addActionRowComponents((actionRow) =>
        actionRow.setComponents(
          new ButtonBuilder()
            .setCustomId(`consent_accept_${user.id}`)
            .setLabel('Chấp thuận')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`consent_decline_${user.id}`)
            .setLabel('Từ chối')
            .setStyle(ButtonStyle.Danger)
        )
      );

    return { components: [consentContainer], flags: MessageFlags.IsComponentsV2 };
  }

  async sendConsentEmbed(interaction, user) {
    const embedData = this.createConsentEmbed(user);
    return await sendEmbedWithFallback(interaction, embedData, user.username, 'sendMessages', 'reply');
  }

  createConsentResultMessage(user, accentColor, title, description) {
    const resultContainer = createContainer()
      .setAccentColor(accentColor)
      .addSectionComponents((section) =>
        section
          .addTextDisplayComponents(
            (textDisplay) => textDisplay.setContent(`## ${title}`),
            (textDisplay) => textDisplay.setContent(description)
          )
          .setThumbnailAccessory((thumbnail) =>
            thumbnail.setURL(user.displayAvatarURL({ extension: 'png', size: 512 }))
          )
      );

    return { components: [resultContainer] };
  }

  async handleConsentAccept(interaction, userId) {
    try {
      await this.updateUserConsent(userId, true);

      const messageData = this.createConsentResultMessage(
        interaction.user,
        0x57F287,
        'Cảm ơn bạn đã tin tưởng Lunaby',
        `**${interaction.user.username}** đã chấp thuận sử dụng dịch vụ Lunaby AI.\n\n` +
        `**Bây giờ bạn có thể:**\n` +
        `> Trò chuyện với Lunaby bằng cách tag @Lunaby\n` +
        `> Sử dụng các lệnh như \`l.help\`\n` +
        `> Nhận XP và level up khi hoạt động\n\n` +
        `Chúc bạn có những trải nghiệm tuyệt vời!`
      );

      const success = await sendEmbedWithFallback(interaction, messageData, interaction.user.username, 'sendMessages', 'update');

      if (success) {
        logger.info('consent', `User ${interaction.user.tag} (${userId}) accepted Terms of Service`);
      }
    } catch (error) {
      logger.error('consent', `Error while processing consent accept for user ${userId}:`, error);
      if (isMissingPermissionError(error)) {
        await handlePermissionError(interaction, 'sendMessages', interaction.user.username, 'update');
      }
    }
  }

  async handleConsentDecline(interaction, userId) {
    try {
      await this.updateUserConsent(userId, false);

      const messageData = this.createConsentResultMessage(
        interaction.user,
        0xED4245,
        'Lunaby tôn trọng quyết định của bạn',
        `**${interaction.user.username}** đã từ chối sử dụng dịch vụ Lunaby AI.\n\n` +
        `**Dữ liệu của bạn**\n` +
        `> Không được lưu trữ trong hệ thống\n` +
        `> Hoàn toàn bảo mật và riêng tư\n\n` +
        `**Lunaby vẫn sẵn sàng giúp đỡ bạn**\n` +
        `> Bạn có thể thay đổi quyết định bất cứ lúc nào\n` +
        `> Chỉ cần tag @Lunaby hoặc sử dụng lệnh để bắt đầu lại\n\n` +
        `Cảm ơn bạn đã dành thời gian!`
      );

      const success = await sendEmbedWithFallback(interaction, messageData, interaction.user.username, 'sendMessages', 'update');

      if (success) {
        logger.info('consent', `User ${interaction.user.tag} (${userId}) declined Terms of Service`);
      }
    } catch (error) {
      logger.error('consent', `Error while processing consent decline for user ${userId}:`, error);
      if (isMissingPermissionError(error)) {
        await handlePermissionError(interaction, 'sendMessages', interaction.user.username, 'update');
      }
    }
  }

  async updateUserConsent(userId, consented) {
    try {
      await mariaClient.query(`
        INSERT INTO user_consents (user_id, consented, version)
        VALUES (?, ?, '1.0')
        ON DUPLICATE KEY UPDATE 
        consented = VALUES(consented),
        version = VALUES(version)
      `, [userId, consented]);
    } catch (error) {
      logger.error('consent', `Error while updating consent for user ${userId}:`, error);
      throw error;
    }
  }
}

module.exports = new ConsentService();