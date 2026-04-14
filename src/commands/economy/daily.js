const {SlashCommandBuilder, MessageFlags} = require('discord.js');
const EconomyService = require('../../services/user/EconomyService');
const emojis = require('../../config/emojis');
const logger = require('../../utils/core/logger');

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Nhận thưởng credits hằng ngày'),
  prefix: {
    name: 'daily',
    aliases: ['dly'],
    description: 'Nhận thưởng credits hằng ngày',
  },
  cooldown: 3,

  async execute(interaction) {
    try {
      const result = await EconomyService.claimDaily(interaction.user.id);

      if (!result.claimed) {
        const nextClaimAtUnix = Math.floor(Number(result.nextClaimAt || Date.now()) / 1000);
        await interaction.reply({
          content: `${emojis.time} | ${interaction.t('commands.daily.already_claimed', { nextClaimAtUnix })}`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const nextClaimAtUnix = Math.floor(Number(result.nextClaimAt) / 1000);
      await interaction.reply(
        `${emojis.success} | ${interaction.t('commands.daily.claimed', { reward: formatNumber(result.reward) })}\n` +
        `${emojis.empty} | ${interaction.t('commands.daily.streak_current', { streak: formatNumber(result.streak) })}\n` +
        `${emojis.empty} | ${interaction.t('commands.daily.streak_bonus', { streakBonus: formatNumber(result.streakBonus) })}\n` +
        `${emojis.empty} | ${interaction.t('commands.daily.next_daily', { nextClaimAtUnix })}`
      );
    } catch (error) {
      logger.error('daily', 'Error in daily command:', error);
      await interaction.reply({
        content: `${emojis.error} | ${interaction.t('commands.daily.error')}`,
        flags: MessageFlags.Ephemeral,
      }).catch(() => { });
    }
  },
};