const { SlashCommandBuilder } = require('discord.js');
const BlacklistService = require('../../services/user/BlacklistService');
const { createLunabyEmbed } = require('../../utils/embedUtils');
const logger = require('../../utils/logger');
const emojis = require('../../config/emojis');

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value);
}

async function getTotalGuilds(client) {
  if (!client.shard) {
    return client.guilds.cache.size;
  }

  const counts = await client.shard.fetchClientValues('guilds.cache.size');
  return counts.reduce((sum, count) => sum + count, 0);
}

async function getTotalUsers(client) {
  if (!client.shard) {
    return client.users.cache.size;
  }

  const shardUserIds = await client.shard.broadcastEval((shardClient) => [...shardClient.users.cache.keys()]);
  return new Set(shardUserIds.flat()).size;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('botstats')
    .setDescription('Xem tổng số server và users hiện tại của bot'),
  prefix: {
    name: 'botstats',
    aliases: ['stats', 'globalstats'],
    description: 'Xem tổng số server và users hiện tại của bot',
    adminOnly: true,
  },
  cooldown: 5,

  async execute(interaction) {
    try {
      const [totalGuilds, totalUsers, blacklistedUsers, blacklistedGuilds] = await Promise.all([
        getTotalGuilds(interaction.client),
        getTotalUsers(interaction.client),
        BlacklistService.getUsers(1000),
        BlacklistService.getGuilds(1000),
      ]);

      const embed = createLunabyEmbed()
        .setTitle('Thống kê tổng quan của bot')
        .addFields(
          { name: 'Tổng server', value: `\`${formatNumber(totalGuilds)}\``, inline: true },
          { name: 'Tổng users', value: `\`${formatNumber(totalUsers)}\``, inline: true },
          { name: 'Shards', value: `\`${interaction.client.shard?.count || 1}\``, inline: true },
          { name: 'User blacklist', value: `\`${formatNumber(blacklistedUsers.length)}\``, inline: true },
          { name: 'Server blacklist', value: `\`${formatNumber(blacklistedGuilds.length)}\``, inline: true },
        );

      await interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });
    } catch (error) {
      logger.error('BOTSTATS', 'Error in botstats command:', error);
      await interaction.reply({
        content: `${emojis.error} Đã xảy ra lỗi khi tải thống kê bot!`,
        ephemeral: true,
      }).catch(() => { });
    }
  },
};
