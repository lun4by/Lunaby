const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const XPService = require('./../../services/XPService');
const { ordinalize } = require('./../../utils/string.js');
const logger = require('./../../utils/logger');


function commatize(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Hiển thị bảng xếp hạng XP của server'),
  prefix: { name: 'leaderboard', aliases: ['lb'], description: 'Xem bảng xếp hạng' },
  cooldown: 5,

  async execute(interaction) {
    return interaction.reply({ content: '🔧 Lệnh này đang được bảo trì. Vui lòng thử lại sau!', ephemeral: true });

    await interaction.deferReply();

    try {
      const leaderboard = await XPService.getLeaderboard(interaction.guild.id, 10);

      if (leaderboard.length === 0) {
        const embed = new EmbedBuilder()
          .setColor('#FF0000')
          .setDescription('Chưa có dữ liệu XP trong server này!');
        return interaction.editReply({ embeds: [embed] });
      }

      const userRank = await XPService.getUserRank(interaction.guild.id, interaction.user.id);

      let nameList = '';
      let xpList = '';

      for (let i = 0; i < leaderboard.length; i++) {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
        nameList += `${medal} - <@${leaderboard[i].userId}>\n\n`;
        xpList += `**${commatize(leaderboard[i].xp)}** XP\n\n`;
      }

      const embed = new EmbedBuilder()
        .setAuthor({ name: `🏆 ${interaction.guild.name} Leaderboard` })
        .setDescription(`<@${leaderboard[0].userId}> đứng đầu với **${commatize(leaderboard[0].xp)}** XP!\n\n`)
        .setColor('#FFD700')
        .addFields(
          { name: 'User', value: nameList, inline: true },
          { name: 'XP', value: xpList, inline: true }
        )
        .setFooter({ text: `Bạn đứng ${ordinalize(userRank)} trong bảng xếp hạng!` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error('LEADERBOARD', 'Error in leaderboard command:', error);
      await interaction.editReply({ content: 'Đã xảy ra lỗi khi tải bảng xếp hạng!', ephemeral: true });
    }
  }
};