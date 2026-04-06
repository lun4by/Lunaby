const { SlashCommandBuilder } = require('discord.js');
const logger = require('../../utils/logger');
const emojis = require('../../config/emojis');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setcolor')
    .setDescription('Đặt màu chủ đạo cho profile card')
    .addStringOption(option =>
      option.setName('color')
        .setDescription('Mã màu hex (ví dụ: #FF0000) hoặc "default" để reset')
        .setRequired(true)),
  prefix: { name: 'setcolor', aliases: ['sc'], description: 'Đặt màu profile card' },
  cooldown: 5,

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const colorInput = interaction.options.getString('color');

      const hexMatch = colorInput.match(/^#?([0-9a-f]{6})$/i);

      let color = null;
      if (colorInput.toLowerCase() === 'default') {
        color = null;
      } else if (hexMatch) {
        color = '#' + hexMatch[1];
      } else {
        return interaction.editReply({
          content: `${emojis.error} ${interaction.t('commands.setcolor.invalid_color')}`
        });
      }

      const MariaModDB = require('../../services/database/MariaModDB');
      await MariaModDB.updateUserProfile(interaction.user.id, ['color'], [color]);

      if (color) {
        await interaction.editReply({
          content: `${emojis.success} ${interaction.t('commands.setcolor.success', { color })}`
        });
      } else {
        await interaction.editReply({
          content: `${emojis.success} ${interaction.t('commands.setcolor.reset_success')}`
        });
      }

    } catch (error) {
      logger.error('SET_COLOR', 'Lỗi khi set color:', error);
      await interaction.editReply({
        content: `${emojis.error} ${interaction.t('commands.setcolor.error')}`
      });
    }
  }
};
