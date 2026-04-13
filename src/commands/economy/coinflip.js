const { SlashCommandBuilder } = require('discord.js');
const EconomyService = require('../../services/user/EconomyService');
const emojis = require('../../config/emojis');
const logger = require('../../utils/core/logger');

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value);
}

function parsePrefixInput(args) {
  const normalized = (args || []).map((arg) => String(arg).toLowerCase());
  const choiceIndex = normalized.findIndex((value) => ['h', 'head', 'heads', 't', 'tail', 'tails'].includes(value));

  let choice = null;
  let bet = null;

  if (choiceIndex >= 0) {
    choice = normalized[choiceIndex];
    const betIndex = choiceIndex === 0 ? 1 : 0;
    bet = args?.[betIndex] ?? null;
  } else {
    choice = normalized[0] ?? null;
    bet = args?.[1] ?? null;
  }

  return { choice, bet };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('coinflip')
    .setDescription('Tung đồng xu để nhận hoặc mất credits')
    .addStringOption((option) =>
      option.setName('choice')
        .setDescription('Chọn heads hoặc tails')
        .setRequired(true)
        .addChoices(
          { name: 'Heads', value: 'heads' },
          { name: 'Tails', value: 'tails' }
        ))
    .addStringOption((option) =>
      option.setName('bet')
        .setDescription('Số credits đặt cược (hoặc all)')
        .setRequired(true)),
  prefix: {
    name: 'coinflip',
    aliases: ['cf', 'coin', 'flip'],
    description: 'Tung đồng xu để cá cược credits',
  },
  cooldown: 10,

  async execute(interaction) {
    try {
      const isSlash = !interaction.message;
      const prefixInput = isSlash ? null : parsePrefixInput(interaction.args);
      const choiceRaw = isSlash
        ? interaction.options.getString('choice')
        : prefixInput.choice;
      const betRaw = isSlash
        ? interaction.options.getString('bet')
        : prefixInput.bet;

      if (!choiceRaw || !betRaw) {
        await interaction.reply({
          content: `${emojis.error} ${interaction.t('commands.coinflip.syntax')}`,
          ephemeral: true,
        });
        return;
      }

      const balance = await EconomyService.getBalance(interaction.user.id);
      const bet = EconomyService.resolveBetAmount(betRaw, balance);
      const result = await EconomyService.playCoinflip(interaction.user.id, bet, choiceRaw);

      const outcomeText = result.outcome === 'heads' ? 'Heads' : 'Tails';
      const choiceText = result.userChoice === 'heads' ? 'Heads' : 'Tails';

      const summary = result.win
        ? `${emojis.success} ${interaction.t('commands.coinflip.win', { amount: formatNumber(result.bet) })}`
        : `${emojis.error} ${interaction.t('commands.coinflip.lose', { amount: formatNumber(result.bet) })}`;

      await interaction.reply(
        `${summary}\n` +
        `${interaction.t('commands.coinflip.choice_vs_outcome', { choice: choiceText, outcome: outcomeText })}\n` +
        `${interaction.t('commands.coinflip.balance', { balance: formatNumber(result.walletAfter) })}`
      );
    } catch (error) {
      logger.error('coinflip', 'Error in coinflip command:', error);
      await interaction.reply({
        content: `${emojis.error} ${error.message || interaction.t('commands.coinflip.error')}`,
        ephemeral: true,
      }).catch(() => { });
    }
  },
};