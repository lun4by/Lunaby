const { SlashCommandBuilder } = require('@discordjs/builders');
const ProfileDB = require('../../services/profiledb');
const XPService = require('../../services/XPService');
const generateRankCard = require('../../services/canvas/rankCanvas');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Hiển thị profile card với XP, level, rank và thông tin cá nhân')
    .addUserOption(option => 
      option.setName('user')
        .setDescription('Người dùng mà bạn muốn xem profile')
        .setRequired(false)),
    
  async execute(interaction) {
    return interaction.reply({ content: '🔧 Lệnh này đang được bảo trì. Vui lòng thử lại sau!', ephemeral: true });

    await interaction.deferReply();

    try {
      const targetUser = interaction.options.getUser('user') || interaction.user;
      const member = await interaction.guild.members.fetch(targetUser.id);

      if (targetUser.bot) {
        return interaction.editReply({
          content: '❌ Bot không có XP!',
          ephemeral: true
        });
      }

      const profile = await ProfileDB.getProfile(targetUser.id);

      let serverXP = await XPService.getUserXP(targetUser.id, interaction.guild.id);
      
      if (!serverXP) {
        serverXP = {
          xp: 0,
          level: 1
        };
      }

      const { xp, level } = serverXP;

      const mlvlcap = XPService.calculateLevelCap(level);
      const lowerLim = level > 1 ? XPService.calculateLevelCap(level - 1) : 0;
      const maxXPThisLevel = mlvlcap - lowerLim;
      const curXPThisLevel = xp - lowerLim;
      const percentage = Math.floor((curXPThisLevel / maxXPThisLevel) * 100);

      const rank = await XPService.getUserRank(targetUser.id, interaction.guild.id);

      let wreathUrl = null;
      if (rank && rank <= 10) {
        wreathUrl = profile.data?.profile?.wreath || null;
      }

      const attachment = await generateRankCard(
        member,
        targetUser,
        level,
        xp,
        mlvlcap,
        maxXPThisLevel,
        curXPThisLevel,
        percentage,
        rank,
        wreathUrl,
        profile.data?.profile || {}
      );

      await interaction.editReply({ files: [attachment] });

    } catch (error) {
      console.error('Lỗi khi tạo profile card:', error);
      await interaction.editReply({
        content: '❌ Có lỗi xảy ra khi tạo profile card!',
        ephemeral: true
      });
    }
  }
};
