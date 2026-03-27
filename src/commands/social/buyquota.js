const { SlashCommandBuilder } = require('discord.js');
const CreditsService = require('../../services/user/CreditsService');
const QuotaService = require('../../services/user/QuotaService');
const { createLunabyEmbed } = require('../../utils/embedUtils');
const logger = require('../../utils/logger');
const emojis = require('../../config/emojis');
const {
  QUOTA_COST_CREDITS_PER_MESSAGE,
  QUOTA_COST_CREDITS_PER_IMAGE,
} = require('../../config/constants');

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value);
}

function getUsageConfig(type) {
  if (type === 'image') {
    return {
      productName: 'Lunaby Vision',
      quotaField: 'imagePeriod',
      costPerUnit: QUOTA_COST_CREDITS_PER_IMAGE,
    };
  }

  return {
    productName: 'Lunaby Pro',
    quotaField: 'period',
    costPerUnit: QUOTA_COST_CREDITS_PER_MESSAGE,
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('buyquota')
    .setDescription('Dùng credits để mua thêm lượt sử dụng Lunaby Pro hoặc Lunaby Vision')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('chat')
        .setDescription('Mua thêm lượt sử dụng Lunaby Pro')
        .addIntegerOption((option) =>
          option.setName('amount')
            .setDescription('Số lượt sử dụng Lunaby Pro muốn mua')
            .setRequired(true)))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('image')
        .setDescription('Mua thêm lượt sử dụng Lunaby Vision')
        .addIntegerOption((option) =>
          option.setName('amount')
            .setDescription('Số lượt sử dụng Lunaby Vision muốn mua')
            .setRequired(true))),

  prefix: {
    name: 'buyquota',
    aliases: ['muaturn', 'buyturn', 'muquota'],
    description: 'Mua thêm lượt sử dụng Lunaby Pro hoặc Lunaby Vision bằng credits',
  },
  cooldown: 5,

  async execute(interaction) {
    const isSlash = !interaction.message;
    const usageType = isSlash
      ? interaction.options.getSubcommand()
      : String(interaction.args?.[0] || '').toLowerCase();
    const amountRaw = isSlash
      ? interaction.options.getInteger('amount')
      : interaction.args?.[1];

    if (!['chat', 'image'].includes(usageType)) {
      return interaction.reply(
        `${emojis.error} Vui lòng dùng \`/buyquota chat <amount>\`, \`/buyquota image <amount>\` hoặc prefix \`buyquota chat|image <amount>\`.`
      );
    }

    if (amountRaw === undefined || amountRaw === null) {
      return interaction.reply(`${emojis.error} Vui lòng nhập số lượt bạn muốn mua.`);
    }

    const amount = parseInt(amountRaw, 10);
    if (Number.isNaN(amount) || amount <= 0) {
      return interaction.reply(`${emojis.error} Số lượt muốn mua phải là một số nguyên dương.`);
    }

    try {
      const userId = interaction.user.id;
      const quotaBefore = await QuotaService.getUserMessageStats(userId);
      const usageConfig = getUsageConfig(usageType);
      const currentLimit = quotaBefore.limits[usageConfig.quotaField];

      if (currentLimit === -1) {
        return interaction.reply({
          content: `${emojis.error} Tài khoản của bạn đang có lượt sử dụng ${usageConfig.productName} không giới hạn, không cần mua thêm quota.`,
          ephemeral: true
        });
      }

      const creditsBefore = await CreditsService.getUserCredits(userId);
      const totalCost = amount * usageConfig.costPerUnit;

      if (creditsBefore.credits < totalCost) {
        return interaction.reply({
          content: `${emojis.error} Bạn không đủ credits. Cần **${formatNumber(totalCost)}** credits để mua **${formatNumber(amount)}** lượt sử dụng ${usageConfig.productName}.`,
          ephemeral: true
        });
      }

      await CreditsService.purchaseQuotaWithCredits(userId, usageType, amount, totalCost);

      const creditsAfter = await CreditsService.getUserCredits(userId);
      const quotaAfter = await QuotaService.getUserMessageStats(userId);
      const newLimit = quotaAfter.limits[usageConfig.quotaField];

      const embed = createLunabyEmbed()
        .setTitle(`${emojis.success} Mua quota thành công`)
        .setColor(0x2ECC71)
        .setDescription(
          `Bạn đã dùng **${formatNumber(totalCost)}** credits để mua **${formatNumber(amount)}** lượt sử dụng ${usageConfig.productName}.`
        )
        .addFields(
          { name: 'Gói mua', value: usageConfig.productName, inline: true },
          { name: 'Giá', value: `1 lượt = ${formatNumber(usageConfig.costPerUnit)} credits`, inline: true },
          { name: 'Credits còn lại', value: `${formatNumber(creditsAfter.credits)}`, inline: true },
          { name: 'Quota mới', value: `${formatNumber(newLimit)} lượt`, inline: true }
        );

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      logger.error('BUYQUOTA', 'Error in buyquota command:', error);
      await interaction.reply({
        content: `${emojis.error} Đã xảy ra lỗi khi mua thêm quota. Vui lòng thử lại sau.`,
        ephemeral: true
      }).catch(() => { });
    }
  }
};
