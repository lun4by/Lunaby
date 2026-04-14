const {SlashCommandBuilder, MessageFlags} = require('discord.js');
const CreditsService = require('../../services/user/CreditsService');
const logger = require('../../utils/core/logger');
const emojis = require('../../config/emojis');

function formatCredits(amount) {
  return new Intl.NumberFormat('en-US').format(amount);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('credits')
    .setDescription('Xem số credits hiện tại của bạn'),
  prefix: { name: 'credits', aliases: ['credit', 'bal', 'balance'], description: 'Xem số credits của bạn' },
  cooldown: 5,

  async execute(interaction) {
    try {
      const targetUser = interaction.user;

      const { credits } = await CreditsService.getUserCredits(targetUser.id);

      await interaction.reply({
        content: interaction.t('commands.credits.balance', { amount: formatCredits(credits) })
      });
    } catch (error) {
      logger.error('credits', 'Error while running /credits:', error);
      const payload = {
        content: `${emojis.error} ${interaction.t('commands.credits.error')}`,
        flags: MessageFlags.Ephemeral
      };
      const respond = interaction.replied || interaction.deferred
        ? interaction.followUp(payload)
        : interaction.reply(payload);
      await respond.catch(() => { });
    }
  }
};
