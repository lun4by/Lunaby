const { SlashCommandBuilder } = require('discord.js');
const UserProfileDB = require('../../services/database/UserProfileDB');
const XPService = require('../../services/user/XPService');
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
  prefix: { name: 'profile', aliases: ['p'], description: 'Xem profile' },
  cooldown: 5,

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

      const profile = await UserProfileDB.getUserProfile(targetUser.id);
      const profileData = profile?.data?.profile || {};

      const attachment = await generateProfileCard({
        user: targetUser,
        profile: profileData
      });

      await interaction.editReply({ content: '', files: [attachment] });

    } catch (error) {
      logger.error('PROFILE', 'Error creating profile card:', error);
      await interaction.editReply({
        content: 'Có lỗi xảy ra khi tạo profile card!',
        ephemeral: true
      });
    }
  }
};