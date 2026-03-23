const { SlashCommandBuilder } = require('discord.js');
const ProfileDB = require('../../services/database/profiledb');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setbirthday')
    .setDescription('Đặt ngày sinh cho profile card')
    .addStringOption(option =>
      option.setName('date')
        .setDescription('Ngày sinh theo định dạng DD-MM (ví dụ: 02-12)')
        .setRequired(true)),
  prefix: { name: 'setbirthday', aliases: ['sbirthday'], description: 'Đặt ngày sinh' },
  cooldown: 5,

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const dateInput = interaction.options.getString('date');

      const dateMatch = dateInput.match(/^(\d{1,2})-(\d{1,2})$/);

      if (!dateMatch) {
        return interaction.editReply({
          content: '**Định dạng ngày không hợp lệ!**\n\nVui lòng nhập theo format DD-MM (ví dụ: 02-12 cho ngày 2 tháng 12).'
        });
      }

      const day = parseInt(dateMatch[1]);
      const month = parseInt(dateMatch[2]);

      if (day < 1 || day > 31 || month < 1 || month > 12) {
        return interaction.editReply({
          content: '**Ngày hoặc tháng không hợp lệ!**\n\nNgày phải từ 1-31, tháng phải từ 1-12.'
        });
      }

      const birthday = `${day.toString().padStart(2, '0')}-${month.toString().padStart(2, '0')}`;

      const collection = await ProfileDB.getProfileCollection();
      await collection.updateOne(
        { _id: interaction.user.id },
        { $set: { 'data.profile.birthday': birthday } }
      );

      await interaction.editReply({
        content: `**Ngày sinh của bạn đã được đặt thành:** ${birthday}`
      });

    } catch (error) {
      logger.error('SET_BIRTHDAY', 'Lỗi khi set birthday:', error);
      await interaction.editReply({
        content: 'Có lỗi xảy ra khi cập nhật ngày sinh!'
      });
    }
  }
};