const { SlashCommandBuilder, ChannelType } = require('discord.js');
const guildProfileDB = require('../../services/guildprofiledb');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('chat')
    .setDescription('Tạo thread chat riêng với AI'),

  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const channel = interaction.channel;

      if (!channel.isTextBased() || channel.isThread()) {
        return interaction.editReply({
          content: '❌ Không thể tạo thread trong kênh này. Vui lòng sử dụng trong kênh text thường.'
        });
      }

      const threadName = `💬 Chat với ${interaction.user.displayName}`;

      const thread = await channel.threads.create({
        name: threadName,
        type: ChannelType.PrivateThread,
        reason: `AI Chat thread for ${interaction.user.tag}`,
        invitable: false
      });

      await thread.members.add(interaction.user.id);

      const profile = await guildProfileDB.getGuildProfile(interaction.guildId);
      const aiThreads = profile?.aiThreads || [];
      
      aiThreads.push({
        threadId: thread.id,
        ownerId: interaction.user.id,
        createdAt: Date.now()
      });

      await guildProfileDB.updateGuildProfile(interaction.guildId, {
        aiThreads: aiThreads
      });

      const welcomeMessage = `**Chat AI riêng tư**

Xin chào **${interaction.user.displayName}**! Đây là thread chat riêng của bạn với mình.

**Riêng tư:** Chỉ có bạn và mình có thể xem thread này.

Bắt đầu trò chuyện nào!`;

      await thread.send(welcomeMessage);

      await interaction.editReply({
        content: `Đã tạo thread chat riêng! Vào đây nhé: ${thread}`
      });

      logger.info('CHAT', `Created AI thread ${thread.id} for user ${interaction.user.tag} in guild ${interaction.guildId}`);

    } catch (error) {
      logger.error('CHAT', `Error creating thread: ${error.message}`);
      
      const content = '❌ Không thể tạo thread. Vui lòng thử lại.';
      if (interaction.deferred) {
        await interaction.editReply({ content });
      } else {
        await interaction.reply({ content, ephemeral: true });
      }
    }
  }
};
