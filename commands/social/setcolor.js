const { SlashCommandBuilder } = require('@discordjs/builders');
const ProfileDB = require('../../services/profiledb');

module.exports = {
  disabled: true,
  data: new SlashCommandBuilder()
    .setName('setcolor')
    .setDescription('Đặt màu chủ đạo cho profile card')
    .addStringOption(option =>
      option.setName('color')
        .setDescription('Mã màu hex (ví dụ: #FF0000) hoặc "default" để reset')
        .setRequired(true)),

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
          content: '❌ **Mã màu không hợp lệ!**\n\nVui lòng nhập mã hex hợp lệ (ví dụ: #FF0000) hoặc "default" để reset.'
        });
      }

      const collection = await ProfileDB.getProfileCollection();
      await collection.updateOne(
        { _id: interaction.user.id },
        { $set: { 'data.profile.color': color } }
      );

      if (color) {
        await interaction.editReply({
          content: `✅ **Màu profile card đã được đặt thành:** \`${color}\``
        });
      } else {
        await interaction.editReply({
          content: '✅ **Màu profile card đã được reset về mặc định!**'
        });
      }

    } catch (error) {
      console.error('Lỗi khi set color:', error);
      await interaction.editReply({
        content: '❌ Có lỗi xảy ra khi cập nhật màu!'
      });
    }
  }
};
