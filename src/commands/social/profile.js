const { SlashCommandBuilder } = require('discord.js');
const UserProfileDB = require('../../services/database/UserProfileDB');
const { generateProfileCard } = require('../../services/canvas/profileCanvas');
const logger = require('../../utils/core/logger');
const emojis = require('../../config/emojis');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Hiển thị profile card Discord với thông tin cá nhân và hoạt động')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Người dùng mà bạn muốn xem profile Discord')
        .setRequired(false)),
  prefix: { name: 'profile', aliases: ['p'], description: 'Xem profile Discord' },
  cooldown: 5,

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const targetUser = interaction.options.getUser('user') || interaction.user;
      const member = interaction.options.getMember('user')
        || interaction.guild.members.cache.get(targetUser.id)
        || await interaction.guild.members.fetch({ user: targetUser.id }).catch(() => null);

      if (!member) {
        return interaction.editReply({
          content: `${emojis.error} ${interaction.t('commands.moderation_common.user_not_found')}`,
        });
      }

      const presence = interaction.guild.presences.cache.get(targetUser.id)
        || await interaction.guild.presences.fetch(targetUser.id).catch(() => null);

      if (targetUser.bot) {
        return interaction.editReply({
          content: `${emojis.error} ${interaction.t('commands.profile.no_bot')}`,
          ephemeral: true
        });
      }

      const profile = await UserProfileDB.getUserProfile(targetUser.id);
      const profileData = profile?.data?.profile || {};

      const attachment = await generateProfileCard({
        user: targetUser,
        member,
        presence,
        profile: profileData
      });

      await interaction.editReply({ content: '', files: [attachment] });

    } catch (error) {
      logger.error('profile', 'Error creating profile card:', error);
      await interaction.editReply({
        content: `${emojis.error} ${interaction.t('commands.profile.error')}`,
      });
    }
  }
};
