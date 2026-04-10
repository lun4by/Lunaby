const { SlashCommandBuilder } = require('discord.js');
const CreditsService = require('../../services/user/CreditsService');
const logger = require('../../utils/logger');
const emojis = require('../../config/emojis');

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('give')
    .setDescription('Chuyển credits cho người dùng khác')
    .addUserOption((option) =>
      option.setName('user')
        .setDescription('Người dùng nhận credits')
        .setRequired(true))
    .addIntegerOption((option) =>
      option.setName('amount')
        .setDescription('Số credits muốn chuyển')
        .setRequired(true)),

  prefix: {
    name: 'give',
    aliases: ['pay', 'transfer'],
    description: 'Chuyển credits cho người dùng khác',
  },
  cooldown: 5,

  async execute(interaction) {
    const isSlash = !interaction.message;
    const targetUser = isSlash
      ? interaction.options.getUser('user')
      : interaction.message?.mentions?.users?.first();
    const amountRaw = isSlash
      ? interaction.options.getInteger('amount')
      : interaction.args?.find((arg) => !arg.match(/^<@!?\d+>$/));

    if (!targetUser || amountRaw === undefined || amountRaw === null) {
      return interaction.reply(`${emojis.error} ${interaction.t('commands.give.invalid_input')}`);
    }

    const amount = parseInt(amountRaw, 10);
    if (Number.isNaN(amount) || amount <= 0) {
      return interaction.reply(`${emojis.error} ${interaction.t('commands.give.must_be_positive')}`);
    }

    if (targetUser.bot) {
      return interaction.reply({ content: `${emojis.error} ${interaction.t('commands.give.no_bot')}`, ephemeral: true });
    }

    if (targetUser.id === interaction.user.id) {
      return interaction.reply({ content: `${emojis.error} ${interaction.t('commands.give.no_self')}`, ephemeral: true });
    }

    try {
      const result = await CreditsService.transferCredits(interaction.user.id, targetUser.id, amount);

      await interaction.reply(
        `${emojis.success} ${interaction.t('commands.give.success', { amount: formatNumber(amount), targetId: targetUser.id, balance: formatNumber(result.fromBalance) })}`
      );
    } catch (error) {
      logger.error('GIVE', 'Error in give command:', error);
      await interaction.reply({
        content: `${emojis.error} ${interaction.t('commands.give.error')}`,
        ephemeral: true
      }).catch(() => { });
    }
  }
};