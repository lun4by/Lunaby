const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const XPService = require('../../services/user/XPService');
const { ordinalize } = require('../../utils/string.js');
const { generateLeaderboardCard } = require('../../services/canvas/leaderboardCanvas');
const logger = require('../../utils/logger');
const emojis = require('../../config/emojis');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Hiển thị bảng xếp hạng XP của server'),
  prefix: { name: 'leaderboard', aliases: ['lb'], description: 'Xem bảng xếp hạng' },
  cooldown: 5,

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const leaderboard = await XPService.getLeaderboard(interaction.guild.id, 10);

      if (leaderboard.length === 0) {
        const embed = new EmbedBuilder()
          .setColor('#FF0000')
          .setDescription('Chưa có dữ liệu XP trong server này!');
        return interaction.editReply({ embeds: [embed] });
      }

      const usersData = [];
      for (let i = 0; i < leaderboard.length; i++) {
        let user;
        try {
          user = await interaction.client.users.fetch(leaderboard[i].userId);
        } catch (e) {
          user = {
            tag: `Người dùng ẩn`,
            displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png'
          };
        }

        usersData.push({
          top: i + 1,
          avatar: user.displayAvatarURL({ extension: 'png', size: 128 }),
          tag: user.tag || user.username || 'Unknown',
          score: leaderboard[i].xp
        });
      }

      const attachment = await generateLeaderboardCard(usersData);

      const userRank = await XPService.getUserRank(interaction.guild.id, interaction.user.id);

      await interaction.editReply({
        content: `Cùng vinh danh top 10 thành viên năng động nhất server! 🎉\nBạn đang đứng thứ **${ordinalize(userRank)}** trong bảng xếp hạng.`,
        files: [attachment]
      });

    } catch (error) {
      logger.error('LEADERBOARD', 'Error in leaderboard command:', error);
      await interaction.editReply({ content: `${emojis.error} Đã xảy ra lỗi khi tải bảng xếp hạng!`, ephemeral: true });
    }
  }
};