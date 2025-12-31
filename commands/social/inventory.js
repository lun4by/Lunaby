const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ProfileDB = require('../../services/profiledb');
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

      const embed = new EmbedBuilder()
        .setTitle(`🎒 Inventory của ${interaction.user.username}`)
        .setColor('#7F5AF0')
        .setDescription(`Bạn có **${inventory.length}** loại items`)
        .setThumbnail(interaction.user.displayAvatarURL())
        .setTimestamp();

      const typeEmojis = {
        background: '🖼️',
        pattern: '🎨',
        emblem: '🏆',
        hat: '🎩',
        wreath: '🌿'
      };

      for (const [type, items] of Object.entries(itemsByType)) {
        const emoji = typeEmojis[type] || '📦';
        const itemList = items.map(item => {
          const rarity = {
            common: '⚪',
            rare: '🔵',
            epic: '🟣',
            legendary: '🟠',
            achievement: '🌟'
          }[item.rarity] || '⚪';

          return `${rarity} **${item.name}** (ID: ${item.id})${item.quantity > 1 ? ` x${item.quantity}` : ''}`;
        }).join('\n');

        embed.addFields({
          name: `${emoji} ${type.toUpperCase()}`,
          value: itemList,
          inline: false
        });
      }

      embed.setFooter({ text: 'Dùng /use <id> để trang bị item!' });

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      logger.error('INVENTORY', 'Lỗi khi xem inventory:', error);
      await interaction.editReply({
        content: '❌ Có lỗi xảy ra khi xem inventory!'
      });
    }
  }
};
