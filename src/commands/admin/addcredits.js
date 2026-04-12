const { SlashCommandBuilder } = require('discord.js');
const CreditsService = require('../../services/user/CreditsService');
const logger = require('../../utils/core/logger');
const emojis = require('../../config/emojis.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('addcredits')
    .setDescription('Thêm hoặc bớt credits cho một người dùng (Admin Only)')
    .addUserOption((option) =>
      option.setName('user')
        .setDescription('Người dùng cần thay đổi credits')
        .setRequired(true))
    .addIntegerOption((option) =>
      option.setName('amount')
        .setDescription('Số credits muốn cộng thêm, dùng số âm để trừ đi')
        .setRequired(true)),

  prefix: { name: 'addcredits', aliases: ['givecredits', 'creditadd'], description: 'Thêm hoặc bớt credits cho user', adminOnly: true },
  cooldown: 5,

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');

    if (!targetUser || amount === null) {
      return interaction.reply({ content: `${emojis.error} ${interaction.t('commands.admin.addcredits.invalid_args')}`, ephemeral: true });
    }

    if (targetUser.bot) {
      return interaction.reply({ content: `${emojis.error} ${interaction.t('commands.admin.addcredits.cannot_add_bot')}`, ephemeral: true });
    }

    try {
      const before = await CreditsService.getUserCredits(targetUser.id);
      const after = await CreditsService.addCredits(targetUser.id, amount);
      const actionWord = amount >= 0 ? interaction.t('commands.admin.addcredits.success_add') : interaction.t('commands.admin.addcredits.success_sub');

      await interaction.reply(
        `${emojis.success} ${interaction.t('commands.admin.addcredits.success_msg', {
          action: actionWord,
          amount: Math.abs(amount),
          userId: targetUser.id,
          userTag: targetUser.tag,
          before: before.credits,
          after: after.credits,
          sign: amount >= 0 ? '+' : '',
        })}`
      );
    } catch (error) {
      logger.error('admin', 'Error in addcredits command:', error);
      await interaction.reply({
        content: `${emojis.error} ${interaction.t('commands.admin.addcredits.error')}`,
        ephemeral: true
      }).catch(() => { });
    }
  }
};
