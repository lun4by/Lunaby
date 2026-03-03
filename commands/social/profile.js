const { SlashCommandBuilder } = require('@discordjs/builders');
const ProfileDB = require('../../services/database/profiledb');
const XPService = require('../../services/XPService');
const { generateProfileCard } = require('../../services/canvas/profileCanvas');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Hiển thị profile card với XP, level, rank và thông tin cá nhân')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Người dùng mà bạn muốn xem profile')
        .setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const targetUser = interaction.options.getUser('user') || interaction.user;
      const member = await interaction.guild.members.fetch(targetUser.id);

      if (targetUser.bot) {
        return interaction.editReply({
          content: 'Bot không có profile!',
          ephemeral: true
        });
      }

      const profile = await ProfileDB.getProfile(targetUser.id);
      const profileData = profile?.data?.profile || {};
      const economyData = profile?.data?.economy || {};
      const tipsData = profile?.data?.tips || {};

      let serverXP = await XPService.getUserXP(targetUser.id, interaction.guild.id);
      if (!serverXP) {
        serverXP = { xp: 0, level: 1 };
      }

      const serverRank = await XPService.getUserRank(targetUser.id, interaction.guild.id);

      let globalRank = null;
      try {
        globalRank = await XPService.getGlobalUserRank?.(targetUser.id) || null;
      } catch { }

      const attachment = await generateProfileCard({
        user: targetUser,
        member: member,
        profile: {
          ...profileData,
          economy: economyData,
          tips: tipsData
        },
        xpData: serverXP,
        serverRank: serverRank,
        globalRank: globalRank
      });

      await interaction.editReply({ files: [attachment] });

    } catch (error) {
      logger.error('PROFILE', 'Error creating profile card:', error);
      await interaction.editReply({
        content: 'Có lỗi xảy ra khi tạo profile card!',
        ephemeral: true
      });
    }
  }
};