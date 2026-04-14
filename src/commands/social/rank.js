const {SlashCommandBuilder} = require('discord.js');
const XPService = require('../../services/user/XPService');
const generateRankCard = require('../../services/canvas/rankCanvas.js');
const { ordinalize } = require('../../utils/text/string.js');
const logger = require('../../utils/core/logger');
const emojis = require('../../config/emojis');

const { createEmbed } = require('../../utils/discord/builderFactory');
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
        const embed = createEmbed()
          .setColor('#FF0000')
          .setDescription(interaction.t('commands.rank.no_xp', { user: targetUser.toString() }));
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
      logger.error('rank', 'Error in rank command:', error);
      await interaction.editReply({ content: `${emojis.error} ${interaction.t('commands.rank.error')}` });
    }
  }
};
