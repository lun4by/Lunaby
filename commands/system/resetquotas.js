const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const QuotaService = require('../../services/TokenService.js');
const logger = require('../../utils/logger.js');
require('dotenv').config();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('resetquota')
    .setDescription('Reset quota tin nhắn cho người dùng (Owner only)')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Người dùng cần reset quota')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const ownerId = process.env.OWNER_ID;
    if (interaction.user.id !== ownerId) {
      return interaction.reply({ 
        content: 'Bạn không có quyền sử dụng lệnh này!', 
        ephemeral: true 
      });
    }

    try {
      await interaction.deferReply({ ephemeral: true });

      const targetUser = interaction.options.getUser('user');

      await QuotaService.resetUserQuota(targetUser.id);

      const stats = await QuotaService.getUserMessageStats(targetUser.id);

      const embed = new EmbedBuilder()
        .setTitle('✅ Reset Quota Thành Công')
        .setColor('#00ff00')
        .setDescription(`Đã reset quota cho ${targetUser}`)
        .addFields(
          { name: '👤 Người dùng', value: targetUser.tag, inline: true },
          { name: '🔄 Trạng thái', value: 'Đã reset về 0', inline: true },
          { name: '\u200b', value: '\u200b', inline: true },
          { name: '💬 Đang sử dụng', value: `${stats.usage.current.toLocaleString()} / ${stats.limits.period.toLocaleString()}`, inline: true },
          { name: '📊 Tổng đã dùng', value: `${stats.usage.total.toLocaleString()} tin nhắn`, inline: true },
          { name: '⏰ Reset sau', value: `${stats.remaining.days} ngày`, inline: true }
        )
        .setFooter({ text: `Thực hiện bởi ${interaction.user.tag}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      logger.info('ADMIN', `${interaction.user.tag} đã reset quota cho ${targetUser.tag}`);
    } catch (error) {
      logger.error('ADMIN', 'Lỗi khi reset quota:', error);
      await interaction.editReply({
        content: `❌ Lỗi khi reset quota: ${error.message}`,
        ephemeral: true
      });
    }
  },
};

