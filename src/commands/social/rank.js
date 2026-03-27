const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const XPService = require('../../services/user/XPService');
const generateRankCard = require('../../services/canvas/rankCanvas.js');
const { ordinalize } = require('../../utils/string.js');
const logger = require('../../utils/logger');
const emojis = require('../../config/emojis');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Hiển thị rank, level và XP của người dùng')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Người dùng cần xem rank')
        .setRequired(false)
    ),
  prefix: { name: 'rank', aliases: ['r'], description: 'Xem rank' },
  cooldown: 5,

  async execute(interaction) {
    await interaction.deferReply();

    const targetUser = interaction.options.getUser('user') || interaction.user;
    const member = await interaction.guild.members.fetch(targetUser.id);

    try {
      const serverXP = await XPService.getUserXP(interaction.guild.id, targetUser.id);

      if (!serverXP || serverXP.xp === 0) {
        const embed = new EmbedBuilder()
          .setColor('#FF0000')
          .setDescription(`${targetUser} chưa có điểm kinh nghiệm nào trong server này!`);
        return interaction.editReply({ embeds: [embed] });
      }

      const level = serverXP.level;

      const maxXPThisLevel = serverXP.maxLevelXP;
      const curXPThisLevel = serverXP.currentLevelXP;
      const userRank = await XPService.getUserRank(interaction.guild.id, targetUser.id);

      const attachment = await generateRankCard({
        member,
        author: targetUser,
        level,
        rank: userRank,
        currentXp: curXPThisLevel,
        requiredXp: maxXPThisLevel
      });

      await interaction.editReply({ content: '', files: [attachment] });
    } catch (error) {
      logger.error('RANK', 'Error in rank command:', error);
      await interaction.editReply({ content: `${emojis.error} Đã xảy ra lỗi khi tạo rank card!`, ephemeral: true });
    }
  }
};