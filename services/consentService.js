const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ProfileDB = require('./profiledb');
const logger = require('../utils/logger.js');
const { handlePermissionError, sendEmbedWithFallback, hasPermission } = require('../utils/permissionUtils');

class ConsentService {
  async hasUserConsented(userId) {
    try {
      const profile = await ProfileDB.getProfile(userId);
      return profile?.data?.consent === true;
    } catch (error) {
      logger.error('CONSENT', `Lỗi khi kiểm tra consent cho user ${userId}:`, error);
      return false;
    }
  }


  createConsentEmbed(user) {
    const embed = new EmbedBuilder()
      .setTitle('Chào mừng bạn đến với Lunaby AI')
      .setDescription(
        `Xin chào **${user.username}**!\n\n` +
        `Mình là **Lunaby**, AI assistant sẵn sàng hỗ trợ bạn.\n\n` +
        `Để sử dụng dịch vụ, bạn cần đồng ý với các điều khoản sau:\n\n` +
        `**Dữ liệu được thu thập**\n` +
        `> Tin nhắn trò chuyện・Thông tin cơ bản (username, ID)・Dữ liệu XP và level\n\n` +
        `**Cam kết bảo mật**\n` +
        `> Dữ liệu được mã hóa và bảo mật\n` +
        `> Không chia sẻ với bên thứ ba\n` +
        `> Có thể xóa dữ liệu bất cứ lúc nào\n\n` +
        `**Bạn có đồng ý sử dụng dịch vụ Lunaby AI không?**`
      )
      .setColor(0x5865F2)
      .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 512 }))
      .setFooter({ text: 'Lunaby AI • Developed by s4ory' })
      .setTimestamp();

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('consent_accept')
          .setLabel('Chấp thuận')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('consent_decline')
          .setLabel('Từ chối')
          .setStyle(ButtonStyle.Danger)
      );

    return { embeds: [embed], components: [row] };
  }


  async sendConsentEmbed(interaction, user) {
    const embedData = this.createConsentEmbed(user);
    return await sendEmbedWithFallback(interaction, embedData, user.username, 'embedLinks', 'reply');
  }


  async handleConsentAccept(interaction, userId) {
    try {
      await this.updateUserConsent(userId, true);

      const embed = new EmbedBuilder()
        .setTitle('Cảm ơn bạn đã tin tưởng Lunaby')
        .setDescription(
          `**${interaction.user.username}** đã chấp thuận sử dụng dịch vụ Lunaby AI.\n\n` +
          `**Bây giờ bạn có thể:**\n` +
          `> Trò chuyện với Lunaby bằng cách tag @Lunaby\n` +
          `> Sử dụng các lệnh AI như \`/think\`\n` +
          `> Nhận XP và level up khi hoạt động\n\n` +
          `Chúc bạn có những trải nghiệm tuyệt vời!`
        )
        .setColor(0x57F287)
        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 512 }))
        .setTimestamp();

      const embedData = { embeds: [embed], components: [] };

      const success = await sendEmbedWithFallback(interaction, embedData, interaction.user.username, 'embedLinks', 'update');

      if (success) {
        logger.info('CONSENT', `User ${interaction.user.tag} (${userId}) đã chấp thuận sử dụng dịch vụ`);
      }
    } catch (error) {
      logger.error('CONSENT', `Lỗi khi xử lý consent accept cho user ${userId}:`, error);
      await handlePermissionError(interaction, 'sendMessages', interaction.user.username, 'update');
    }
  }


  async handleConsentDecline(interaction, userId) {
    try {
      await this.updateUserConsent(userId, false);

      const embed = new EmbedBuilder()
        .setTitle('Lunaby tôn trọng quyết định của bạn')
        .setDescription(
          `**${interaction.user.username}** đã từ chối sử dụng dịch vụ Lunaby AI.\n\n` +
          `**Dữ liệu của bạn**\n` +
          `> Không được lưu trữ trong hệ thống\n` +
          `> Hoàn toàn bảo mật và riêng tư\n\n` +
          `**Lunaby vẫn sẵn sàng giúp đỡ bạn**\n` +
          `> Bạn có thể thay đổi quyết định bất cứ lúc nào\n` +
          `> Chỉ cần tag @Lunaby hoặc sử dụng lệnh để bắt đầu lại\n\n` +
          `Cảm ơn bạn đã dành thời gian!`
        )
        .setColor(0xED4245)
        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 512 }))
        .setTimestamp();

      const embedData = { embeds: [embed], components: [] };

      const success = await sendEmbedWithFallback(interaction, embedData, interaction.user.username, 'embedLinks', 'update');

      if (success) {
        logger.info('CONSENT', `User ${interaction.user.tag} (${userId}) đã từ chối sử dụng dịch vụ`);
      }
    } catch (error) {
      logger.error('CONSENT', `Lỗi khi xử lý consent decline cho user ${userId}:`, error);
      await handlePermissionError(interaction, 'sendMessages', interaction.user.username, 'update');
    }
  }


  async updateUserConsent(userId, consented) {
    try {
      const profileCollection = await ProfileDB.getProfileCollection();
      await profileCollection.updateOne(
        { _id: userId },
        { $set: { 'data.consent': consented, 'data.consentDate': new Date(), 'data.consentVersion': '1.0' } },
        { upsert: true }
      );
    } catch (error) {
      logger.error('CONSENT', `Lỗi khi cập nhật consent cho user ${userId}:`, error);
      throw error;
    }
  }
}

module.exports = new ConsentService();
