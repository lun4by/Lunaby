const {
  SlashCommandBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const CreditsService = require('../../services/user/CreditsService');
const QuotaService = require('../../services/user/QuotaService');
const { COLORS } = require('../../utils/discord/embedUtils');
const logger = require('../../utils/core/logger');
const emojis = require('../../config/emojis');
const {
  QUOTA_COST_CREDITS_PER_MESSAGE,
  QUOTA_COST_CREDITS_PER_IMAGE,
} = require('../../config/constants');

const { createContainer } = require('../../utils/discord/builderFactory');
const SHOP_TIMEOUT_MS = 120000;
const ITEMS_PER_PAGE = 6;
const SHOP_PACKAGE_GROUPS = [
  { type: 'chat', title: '**Gói Lunaby Pro**' },
  { type: 'image', title: '**Gói Lunaby Vision**' },
];

const SHOP_ITEMS = [
  { id: 'chat_1', type: 'chat', amount: 1, label: 'Pro x1', style: ButtonStyle.Primary },
  { id: 'chat_5', type: 'chat', amount: 5, label: 'Pro x5', style: ButtonStyle.Primary },
  { id: 'chat_10', type: 'chat', amount: 10, label: 'Pro x10', style: ButtonStyle.Primary },
  { id: 'chat_25', type: 'chat', amount: 25, label: 'Pro x25', style: ButtonStyle.Primary },
  { id: 'image_1', type: 'image', amount: 1, label: 'Vision x1', style: ButtonStyle.Secondary },
  { id: 'image_3', type: 'image', amount: 3, label: 'Vision x3', style: ButtonStyle.Secondary },
  { id: 'image_5', type: 'image', amount: 5, label: 'Vision x5', style: ButtonStyle.Secondary },
  { id: 'image_10', type: 'image', amount: 10, label: 'Vision x10', style: ButtonStyle.Secondary },
];

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value);
}

function getUsageConfig(type, interaction) {
  const proName = interaction?.t ? interaction.t('commands.shop.quota_pro') : 'Lunaby Pro';
  const visionName = interaction?.t ? interaction.t('commands.shop.quota_vision') : 'Lunaby Vision';

  if (type === 'image') {
    return {
      productName: visionName,
      quotaField: 'imagePeriod',
      costPerUnit: QUOTA_COST_CREDITS_PER_IMAGE,
    };
  }

  return {
    productName: proName,
    quotaField: 'period',
    costPerUnit: QUOTA_COST_CREDITS_PER_MESSAGE,
  };
}

function getItemCost(item, interaction) {
  return item.amount * getUsageConfig(item.type, interaction).costPerUnit;
}

function getItemState(item, credits, stats, interaction) {
  const usageConfig = getUsageConfig(item.type, interaction);
  const totalCost = getItemCost(item, interaction);
  const currentLimit = stats.limits[usageConfig.quotaField];
  const isUnlimited = currentLimit === -1;
  const isAffordable = credits >= totalCost;

  return {
    usageConfig,
    totalCost,
    isUnlimited,
    isAffordable,
  };
}

function getShopItems() {
  return SHOP_ITEMS;
}

function getTotalPages() {
  return SHOP_PACKAGE_GROUPS.length;
}

function getPageGroup(page) {
  const safeIndex = Math.min(Math.max(page, 0), getTotalPages() - 1);
  return SHOP_PACKAGE_GROUPS[safeIndex];
}

function getPageItems(page) {
  const group = getPageGroup(page);
  return getShopItems().filter((item) => item.type === group.type);
}

function getLimitText(limit, remaining, interaction) {
  if (limit === -1) {
    return interaction.t('commands.shop.limit_unlimited');
  }

  return `${formatNumber(limit)} lượt • còn ${formatNumber(remaining)} lượt`;
}

function buildShopItemSectionText(item, itemState) {
  return `> - **${item.label}** · **${formatNumber(itemState.totalCost)}** credits`;
}

function addShopHeaderSection(container, user, stats) {
  const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 256 });
  const displayName = user.globalName || user.username;

  container.addSectionComponents((section) =>
    section
      .addTextDisplayComponents(
        (textDisplay) => textDisplay.setContent(`**${displayName}**`),
        (textDisplay) => textDisplay.setContent(buildShopHeroText(stats))
      )
      .setThumbnailAccessory((thumbnail) =>
        thumbnail
          .setURL(avatarUrl)
          .setDescription(displayName)
      )
  );
}

function addShopOverviewSection(container, credits, stats, state, interaction) {
  container
    .addTextDisplayComponents((textDisplay) =>
      textDisplay.setContent(buildShopWalletAndPricingText(credits, state, interaction))
    )
    .addTextDisplayComponents((textDisplay) =>
      textDisplay.setContent(buildShopLimitsText(stats, interaction))
    )
    .addSeparatorComponents((separator) => separator);
}

function addShopPackageSection(container, group, pageItems, credits, stats, interaction, disabled) {
  const items = pageItems.filter((item) => item.type === group.type);

  container.addTextDisplayComponents((textDisplay) =>
    textDisplay.setContent(group.title)
  );

  if (!items.length) {
    container.addTextDisplayComponents((textDisplay) =>
      textDisplay.setContent(interaction.t('commands.shop.no_packages'))
    );
    return;
  }

  for (const item of items) {
    const itemState = getItemState(item, credits, stats, interaction);

    container.addSectionComponents((section) =>
      section
        .addTextDisplayComponents((textDisplay) =>
          textDisplay.setContent(buildShopItemSectionText(item, itemState))
        )
        .setButtonAccessory((button) =>
          button
            .setCustomId(`shop_buy_${item.id}`)
            .setLabel(interaction.t('commands.shop.buy_button'))
            .setStyle(item.style)
            .setDisabled(disabled || itemState.isUnlimited || !itemState.isAffordable)
        )
    );
  }
}

async function updateShopMessage(componentInteraction, user, state, interaction) {
  const refreshedData = await loadShopState(user, state);
  await componentInteraction.update(buildShopMessage(
    user,
    refreshedData.credits,
    refreshedData.quotaStats,
    refreshedData.state,
    interaction
  ));
}

function buildShopHeroText(stats) {
  const resetTimestamp = Math.floor(stats.nextReset / 1000);

  return [
    `## Lunaby Credit Market`,
    `Mở rộng quota bằng credits ngay trong chat.`,
    `Kỳ reset tiếp theo: <t:${resetTimestamp}:R>`,
  ].join('\n');
}

function buildShopWalletAndPricingText(credits, state, interaction) {
  const totalPages = getTotalPages();
  const pageLabel = interaction.t('commands.shop.page');

  return [
    `> - Số dư hiện tại: **${formatNumber(credits)}** credits`,
  ].join('\n');
}

function buildShopLimitsText(stats, interaction) {
  return [
    `## Hạn mức hiện tại`,
    `> - Lunaby Pro: ${getLimitText(stats.limits.period, stats.remaining.messages, interaction)}`,
    `> - Lunaby Vision: ${getLimitText(stats.limits.imagePeriod, stats.remaining.images, interaction)}`,
  ].join('\n');
}

function buildNavigationButtons(state, interaction, disabled = false) {
  const totalPages = getTotalPages();
  const singlePage = totalPages <= 1;

  return [
    new ButtonBuilder()
      .setCustomId('shop_prev')
      .setLabel('<')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || singlePage || state.page === 0),
    new ButtonBuilder()
      .setCustomId('shop_refresh')
      .setLabel(interaction.t('commands.shop.refresh'))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('shop_next')
      .setLabel('>')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || singlePage || state.page >= totalPages - 1)
  ];
}

function buildShopComponents(user, credits, stats, state, interaction, disabled = false) {
  // Dựng shop.
  const pageGroup = getPageGroup(state.page);
  const pageItems = getPageItems(state.page);
  const container = createContainer().setAccentColor(COLORS.LUNABY);

  addShopHeaderSection(container, user, stats);
  addShopOverviewSection(container, credits, stats, state, interaction);
  addShopPackageSection(container, pageGroup, pageItems, credits, stats, interaction, disabled);
  container.addSeparatorComponents((separator) => separator);

  container.addActionRowComponents((actionRow) =>
    actionRow.setComponents(...buildNavigationButtons(state, interaction, disabled))
  );

  return [container];
}

function buildShopMessage(user, credits, stats, state, interaction, disabled = false) {
  return {
    components: buildShopComponents(user, credits, stats, state, interaction, disabled),
  };
}

async function loadShopState(user, state) {
  const [creditsData, quotaStats] = await Promise.all([
    CreditsService.getUserCredits(user.id),
    QuotaService.getUserMessageStats(user.id),
  ]);

  const totalPages = getTotalPages();
  const nextState = {
    page: Math.min(Math.max(state.page, 0), totalPages - 1),
  };

  return {
    state: nextState,
    credits: creditsData.credits,
    quotaStats,
  };
}

async function purchaseItem(userId, item, interaction) {
  const usageConfig = getUsageConfig(item.type, interaction);
  const totalCost = getItemCost(item, interaction);

  const quotaBefore = await QuotaService.getUserMessageStats(userId);
  const currentLimit = quotaBefore.limits[usageConfig.quotaField];

  if (currentLimit === -1) {
    throw new Error(interaction.t('commands.shop.err_unlimited', { product: usageConfig.productName }));
  }

  const creditsBefore = await CreditsService.getUserCredits(userId);
  if (creditsBefore.credits < totalCost) {
    throw new Error(
      interaction.t('commands.shop.err_insufficient', { cost: formatNumber(totalCost), amount: formatNumber(item.amount), product: usageConfig.productName })
    );
  }

  await CreditsService.purchaseQuotaWithCredits(userId, item.type, item.amount, totalCost);

  const [creditsAfter, quotaAfter] = await Promise.all([
    CreditsService.getUserCredits(userId),
    QuotaService.getUserMessageStats(userId),
  ]);

  return {
    usageConfig,
    totalCost,
    creditsAfter: creditsAfter.credits,
    quotaAfter,
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Mở Quota Shop để mua thêm lượt sử dụng bằng credits'),

  prefix: {
    name: 'shop',
    aliases: ['buyquota', 'muaturn', 'buyturn', 'muquota'],
    description: 'Mở Quota Shop của Lunaby',
  },
  cooldown: 5,

  async execute(interaction) {
    const user = interaction.user;
    const currentState = { page: 0 };

    try {
      const initialData = await loadShopState(user, currentState);

      await interaction.reply({
        ...buildShopMessage(
          user,
          initialData.credits,
          initialData.quotaStats,
          initialData.state,
          interaction
        ),
        flags: MessageFlags.IsComponentsV2,
      });

      const message = await interaction.fetchReply();
      const collector = message.createMessageComponentCollector({ time: SHOP_TIMEOUT_MS });

      collector.on('collect', async (componentInteraction) => {
        if (componentInteraction.user.id !== user.id) {
          return componentInteraction.reply({
            content: interaction.t('system.only_caller_can_use'),
            ephemeral: true,
          });
        }

        try {
          if (!componentInteraction.isButton()) {
            return;
          }

          if (componentInteraction.customId === 'shop_prev') {
            currentState.page = Math.max(0, currentState.page - 1);
            await updateShopMessage(componentInteraction, user, currentState, interaction);
            return;
          }

          if (componentInteraction.customId === 'shop_next') {
            currentState.page = Math.min(getTotalPages() - 1, currentState.page + 1);
            await updateShopMessage(componentInteraction, user, currentState, interaction);
            return;
          }

          if (componentInteraction.customId === 'shop_refresh') {
            await updateShopMessage(componentInteraction, user, currentState, interaction);
            return;
          }

          if (componentInteraction.customId.startsWith('shop_buy_')) {
            const itemId = componentInteraction.customId.replace('shop_buy_', '');
            const item = SHOP_ITEMS.find((entry) => entry.id === itemId);

            if (!item) {
              return componentInteraction.reply({
                content: `${emojis.error} ${interaction.t('commands.shop.package_not_found')}`,
                ephemeral: true,
              });
            }

            const purchaseResult = await purchaseItem(user.id, item, interaction);
            const refreshedData = {
              credits: purchaseResult.creditsAfter,
              quotaStats: purchaseResult.quotaAfter,
              state: {
                page: Math.min(currentState.page, getTotalPages() - 1),
              },
            };

            await componentInteraction.update(buildShopMessage(
              user,
              refreshedData.credits,
              refreshedData.quotaStats,
              refreshedData.state,
              interaction
            ));

            await componentInteraction.followUp({
              content: `${emojis.success} ${interaction.t('commands.shop.buy_success', { amount: formatNumber(item.amount), product: purchaseResult.usageConfig.productName, cost: formatNumber(purchaseResult.totalCost) })}`,
              ephemeral: true,
            });
          }
        } catch (error) {
          logger.error('shop', 'Error while handling shop component:', error);

          const payload = {
            content: `${emojis.error} ${interaction.t('commands.shop.error_process', { error: error.message || '' })}`,
            ephemeral: true,
          };

          if (componentInteraction.replied || componentInteraction.deferred) {
            await componentInteraction.followUp(payload).catch(() => {});
          } else {
            await componentInteraction.reply(payload).catch(() => {});
          }
        }
      });

      collector.on('end', async () => {
        try {
          const latestData = await loadShopState(user, currentState);
          await interaction.editReply(buildShopMessage(
            user,
            latestData.credits,
            latestData.quotaStats,
            latestData.state,
            interaction,
            true
          ));
        } catch (error) {
          logger.error('shop', 'Error while disabling shop components:', error);
        }
      });
    } catch (error) {
      logger.error('shop', 'Error in shop command:', error);
      const payload = {
        content: `${emojis.error} ${interaction.t('commands.shop.error_open')}`,
        ephemeral: true,
      };

      const respond = interaction.replied || interaction.deferred
        ? interaction.followUp(payload)
        : interaction.reply(payload);
      await respond.catch(() => {});
    }
  },
};