const { SlashCommandBuilder } = require('@discordjs/builders');
const ProfileDB = require('../../services/profiledb');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setbio')
    .setDescription('Đặt bio cho profile card của bạn')
    .addStringOption(option =>
      option.setName('bio')
        .setDescription('Nội dung bio (tối đa 200 ký tự)')
        .setRequired(true)
        .setMaxLength(200)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const bio = interaction.options.getString('bio');

      const profile = await ProfileDB.getProfile(interaction.user.id);

      const collection = await ProfileDB.getProfileCollection();
      await collection.updateOne(
        { _id: interaction.user.id },
        { $set: { 'data.profile.bio': bio } }
      );

      await interaction.editReply({
        content: `✅ **Bio của bạn đã được cập nhật!**\n\n${bio}`
      });

    } catch (error) {
      logger.error('SET_BIO', 'Lỗi khi set bio:', error);
      await interaction.editReply({
        content: '❌ Có lỗi xảy ra khi cập nhật bio!'
      });
    }
  }
};
