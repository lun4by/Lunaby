const { SlashCommandBuilder } = require('@discordjs/builders');
const ProfileDB = require('../../services/database/profiledb');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unequip')
    .setDescription('Gỡ bỏ item đã trang bị khỏi profile card')
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Loại item cần gỡ')
        .setRequired(true)
        .addChoices(
          { name: 'Background (Nền)', value: 'background' },
          { name: 'Pattern (Họa tiết)', value: 'pattern' },
          { name: 'Emblem (Biểu tượng)', value: 'emblem' },
          { name: 'Hat (Mũ)', value: 'hat' },
          { name: 'Wreath (Vòng nguyệt quế)', value: 'wreath' }
        )),

  async execute(interaction) {
    return interaction.reply({ content: '🔧 Lệnh này đang được bảo trì. Vui lòng thử lại sau!', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    try {
      const itemType = interaction.options.getString('type');

      const profile = await ProfileDB.getProfile(interaction.user.id);
      const currentValue = profile.data?.profile?.[itemType];

      if (!currentValue) {
        return interaction.editReply({
          content: `❌ **Bạn chưa trang bị ${itemType} nào!**`
        });
      }

      const collection = await ProfileDB.getProfileCollection();
      const updateField = `data.profile.${itemType}`;

      await collection.updateOne(
        { _id: interaction.user.id },
        { $set: { [updateField]: null } }
      );

      await interaction.editReply({
        content: `✅ **Đã gỡ bỏ ${itemType}!**\n\nHãy dùng \`/profile\` để xem thay đổi.`
      });

    } catch (error) {
      logger.error('UNEQUIP', 'Lỗi khi unequip item:', error);
      await interaction.editReply({
        content: '❌ Có lỗi xảy ra khi gỡ bỏ item!'
      });
    }
  }
};
