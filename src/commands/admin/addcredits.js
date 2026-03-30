const { SlashCommandBuilder } = require('discord.js');
const CreditsService = require('../../services/user/CreditsService');
const logger = require('../../utils/logger');
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
      return interaction.reply({ content: `${emojis.error} Vui lòng chọn user và amount hợp lệ.`, ephemeral: true });
    }

    if (targetUser.bot) {
      return interaction.reply({ content: `${emojis.error} Không thể cấp credits cho bot.`, ephemeral: true });
    }

    try {
      const before = await CreditsService.getUserCredits(targetUser.id);
      const after = await CreditsService.addCredits(targetUser.id, amount);
      const actionWord = amount >= 0 ? 'Cộng thêm' : 'Trừ đi';

      await interaction.reply(
        `${emojis.success} ${actionWord} **${Math.abs(amount)}** credits cho <@${targetUser.id}>.\n` +
        `Người dùng: **${targetUser.tag}**\n` +
        `Credits cũ: **${before.credits}**\n` +
        `Credits mới: **${after.credits}**\n` +
        `Thay đổi: **${amount >= 0 ? '+' : ''}${amount}**`
      );
    } catch (error) {
      logger.error('ADMIN', 'Error in addcredits command:', error);
      await interaction.reply({
        content: `${emojis.error} Đã xảy ra lỗi khi cập nhật credits cho người dùng này.`,
        ephemeral: true
      }).catch(() => { });
    }
  }
};
