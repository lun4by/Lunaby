const { SlashCommandBuilder } = require('discord.js');
const ProfileDB = require('../../services/database/profiledb');
const market = require('../../assets/json/market.json');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('Xem các items trong inventory của bạn'),

  async execute(interaction) {
    return interaction.reply({ content: '🔧 Lệnh này đang được bảo trì. Vui lòng thử lại sau!', ephemeral: true });

    await interaction.deferReply();

    try {
      const profile = await ProfileDB.getProfile(interaction.user.id);
      const inventory = profile.data?.profile?.inventory || [];

      if (inventory.length === 0) {
        return interaction.editReply({
          content: '❌ **Inventory của bạn đang trống!**\n\nHãy mua items từ `/shop` để trang trí profile card của bạn.'
        });
      }

      const itemsByType = {};
      for (const item of inventory) {
        const marketItem = market.find(m => m.id === item.id);
        if (marketItem) {
          if (!itemsByType[marketItem.type]) {
            itemsByType[marketItem.type] = [];
          }
          itemsByType[marketItem.type].push({
            ...marketItem,
            quantity: item.quantity || 1
          });
        }
      }

      const typeEmojis = {
        background: '🖼️',
        pattern: '🎨',
        emblem: '🏆',
        hat: '🎩',
        wreath: '🌿'
      };

      let content = `🎒 **Inventory của ${interaction.user.username}** (Tổng: ${inventory.length} loại)\n`;
      content += `> *Dùng \`/use <id>\` để trang bị item*\n\n`;

      for (const [type, items] of Object.entries(itemsByType)) {
        const emoji = typeEmojis[type] || '📦';
        content += `${emoji} **${type.toUpperCase()}**\n`;

        const itemList = items.map(item => {
          const rarity = {
            common: '⚪',
            rare: '🔵',
            epic: '🟣',
            legendary: '🟠',
            achievement: '🌟'
          }[item.rarity] || '⚪';

          return `- ${rarity} **${item.name}** (ID: \`${item.id}\`)${item.quantity > 1 ? ` **[x${item.quantity}]**` : ''}`;
        }).join('\n');

        content += `${itemList}\n\n`;
      }

      await interaction.editReply({ content: content.trim() });

    } catch (error) {
      logger.error('INVENTORY', 'Lỗi khi xem inventory:', error);
      await interaction.editReply({
        content: '❌ Có lỗi xảy ra khi xem inventory!'
      });
    }
  }
};
