const { SlashCommandBuilder } = require('@discordjs/builders');
const ProfileDB = require('../../services/profiledb');
const market = require('../../assets/json/market.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('use')
    .setDescription('Trang bị một item từ inventory vào profile card')
    .addIntegerOption(option =>
      option.setName('id')
        .setDescription('ID của item cần trang bị')
        .setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const itemId = interaction.options.getInteger('id');

      const marketItem = market.find(m => m.id === itemId);
      if (!marketItem) {
        return interaction.editReply({
          content: '❌ **Item không tồn tại!**\n\nVui lòng kiểm tra lại ID.'
        });
      }

      const profile = await ProfileDB.getProfile(interaction.user.id);
      const inventory = profile.data?.profile?.inventory || [];

      const hasItem = inventory.some(item => item.id === itemId);
      if (!hasItem) {
        return interaction.editReply({
          content: `❌ **Bạn không có item này trong inventory!**\n\nItem: **${marketItem.name}**\n\nHãy mua từ \`/shop\` trước.`
        });
      }

      const collection = await ProfileDB.getProfileCollection();
      const updateField = `data.profile.${marketItem.type}`;

      await collection.updateOne(
        { _id: interaction.user.id },
        { $set: { [updateField]: marketItem.url } }
      );

      await interaction.editReply({
        content: `✅ **Đã trang bị item!**\n\n${marketItem.name} (${marketItem.type})\n\nHãy dùng \`/profile\` để xem thay đổi!`
      });

    } catch (error) {
      logger.error('INVENTORY', 'Lỗi khi equip item:', error);
      await interaction.editReply({
        content: '❌ Có lỗi xảy ra khi trang bị item!'
      });
    }
  }
};
