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
      return interaction.reply(`${emojis.error} Vui lòng chọn người nhận và nhập số credits hợp lệ.`);
    }

    const amount = parseInt(amountRaw, 10);
    if (Number.isNaN(amount) || amount <= 0) {
      return interaction.reply(`${emojis.error} Số credits muốn chuyển phải là một số nguyên dương.`);
    }

    if (targetUser.bot) {
      return interaction.reply({ content: `${emojis.error} Bạn không thể chuyển credits cho bot.`, ephemeral: true });
    }

    if (targetUser.id === interaction.user.id) {
      return interaction.reply({ content: `${emojis.error} Bạn không thể tự chuyển credits cho chính mình.`, ephemeral: true });
    }

    try {
      const result = await CreditsService.transferCredits(interaction.user.id, targetUser.id, amount);

      await interaction.reply(
        `${emojis.success} Bạn đã chuyển **${formatNumber(amount)}** credits cho <@${targetUser.id}>.\n` +
        `Số dư của bạn: **${formatNumber(result.fromBalance)}** credits.`
      );
    } catch (error) {
      logger.error('GIVE', 'Error in give command:', error);
      await interaction.reply({
        content: `${emojis.error} ${error.message || 'Đã xảy ra lỗi khi chuyển credits.'}`,
        ephemeral: true
      }).catch(() => { });
    }
  }
};