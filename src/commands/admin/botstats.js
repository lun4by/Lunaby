const {SlashCommandBuilder, MessageFlags} = require('discord.js');
const BlacklistService = require('../../services/user/BlacklistService');
const { createLunabyEmbed } = require('../../utils/discord/embedUtils');
const logger = require('../../utils/core/logger');
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

async function getTotalMembers(client) {
  if (!client.shard) {
    return client.guilds.cache.reduce((sum, guild) => sum + (guild.memberCount || 0), 0);
  }

  const counts = await client.shard.broadcastEval((shardClient) =>
    shardClient.guilds.cache.reduce((sum, guild) => sum + (guild.memberCount || 0), 0)
  );
  return counts.reduce((sum, count) => sum + count, 0);
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
      const [totalGuilds, totalMembers, blacklistedUsers, blacklistedGuilds] = await Promise.all([
        getTotalGuilds(interaction.client),
        getTotalMembers(interaction.client),
        BlacklistService.getUsers(1000),
        BlacklistService.getGuilds(1000),
      ]);

      const embed = createLunabyEmbed()
        .setTitle(interaction.t('commands.admin.botstats.title'))
        .addFields(
          { name: interaction.t('commands.admin.botstats.total_guilds'), value: `\`${formatNumber(totalGuilds)}\``, inline: true },
          { name: interaction.t('commands.admin.botstats.total_users'), value: `\`${formatNumber(totalMembers)}\``, inline: true },
          { name: interaction.t('commands.admin.botstats.shards'), value: `\`${interaction.client.shard?.count || 1}\``, inline: true },
          { name: interaction.t('commands.admin.botstats.user_blacklist'), value: `\`${formatNumber(blacklistedUsers.length)}\``, inline: true },
          { name: interaction.t('commands.admin.botstats.server_blacklist'), value: `\`${formatNumber(blacklistedGuilds.length)}\``, inline: true },
        );

      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      logger.error('botstats', 'Error in botstats command:', error);
      await interaction.reply({
        content: `${emojis.error} ${interaction.t('commands.admin.botstats.error')}`,
        flags: MessageFlags.Ephemeral,
      }).catch(() => { });
    }
  },
};