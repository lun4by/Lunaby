const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require('discord.js');
const CreditsService = require('../../services/user/CreditsService');
const QuotaService = require('../../services/user/QuotaService');
const { createLunabyEmbed } = require('../../utils/embedUtils');
const logger = require('../../utils/logger');
const emojis = require('../../config/emojis');
const {
  QUOTA_COST_CREDITS_PER_MESSAGE,
  QUOTA_COST_CREDITS_PER_IMAGE,
} = require('../../config/constants');

const SHOP_TIMEOUT_MS = 120000;
const ITEMS_PER_PAGE = 6;
const SHOP_CATEGORIES = {
  quota: {
    label: 'Quota Shop (Credits)',
    description: 'Mua thêm lượt sử dụng Lunaby Pro và Lunaby Vision bằng credits',
  },
  coin: {
    label: 'Coin Shop',
    description: 'Sắp ra mắt',
  },
};

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

function getItemCost(item) {
  return item.amount * getUsageConfig(item.type).costPerUnit;
}

function getShopItems(category) {
  return category === 'quota' ? SHOP_ITEMS : [];
}

function getTotalPages(category) {
  const items = getShopItems(category);
  return Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function getPageItems(category, page) {
  const items = getShopItems(category);
  const start = page * ITEMS_PER_PAGE;
  return items.slice(start, start + ITEMS_PER_PAGE);
}

function getLimitText(limit, remaining) {
  if (limit === -1) {
    return 'Không giới hạn';
  }

  return `${formatNumber(limit)} lượt - còn ${formatNumber(remaining)} lượt`;
}

function buildShopEmbed(user, credits, stats, state) {
  const categoryMeta = SHOP_CATEGORIES[state.category];
  const resetTimestamp = Math.floor(stats.nextReset / 1000);
  const totalPages = getTotalPages(state.category);

  const embed = createLunabyEmbed()
    .setTitle('Lunaby Shop')
    .setAuthor({
      name: user.globalName || user.username,
      iconURL: user.displayAvatarURL({ size: 128 }),
    })
    .setDescription(
      `Danh mục hiện tại: **${categoryMeta.label}**\n` +
      `Số dư của bạn: **${formatNumber(credits)}** credits\n` +
      `Thanh toán: **Credits**\n` +
      `Reset quota sau: <t:${resetTimestamp}:R>`
    )
    .addFields(
      {
        name: 'Lunaby Pro',
        value: getLimitText(stats.limits.period, stats.remaining.messages),
        inline: true,
      },
      {
        name: 'Lunaby Vision',
        value: getLimitText(stats.limits.imagePeriod, stats.remaining.images),
        inline: true,
      },
      {
        name: 'Trang',
        value: `${state.page + 1}/${totalPages}`,
        inline: true,
      }
    )
    .setFooter({ text: 'Nhấn nút để mua nhanh bằng credits' });

  if (state.category === 'quota') {
    const pageItems = getPageItems(state.category, state.page);
    const listing = pageItems
      .map((item) => {
        const usageConfig = getUsageConfig(item.type);
        return `• **${item.label}** - ${formatNumber(item.amount)} lượt ${usageConfig.productName} - **${formatNumber(getItemCost(item))}** credits`;
      })
      .join('\n');

    embed.addFields({
      name: 'Các gói hiện có',
      value: listing || 'Chưa có gói nào trong trang này.',
    });
  } else {
    embed.addFields({
      name: 'Coin Shop',
      value: 'Mục này đang được chuẩn bị. Hiện tại bạn vẫn có thể mua quota trong Quota Shop.',
    });
  }

  return embed;
}

function buildCategoryRow(state, disabled = false) {
  const select = new StringSelectMenuBuilder()
    .setCustomId('shop_category')
    .setPlaceholder('Chọn cửa hàng')
    .setDisabled(disabled)
    .addOptions(
      Object.entries(SHOP_CATEGORIES).map(([value, meta]) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(meta.label)
          .setDescription(meta.description)
          .setValue(value)
          .setDefault(value === state.category)
      )
    );

  return new ActionRowBuilder().addComponents(select);
}

function buildItemRows(state, credits, stats, disabled = false) {
  if (state.category !== 'quota') {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('shop_placeholder')
          .setLabel('Coin Shop đang được cập nhật')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      ),
    ];
  }

  const rows = [];
  const pageItems = getPageItems(state.category, state.page);
  const buttonGroups = chunkArray(pageItems, 3);

  for (const group of buttonGroups) {
    const row = new ActionRowBuilder();

    for (const item of group) {
      const usageConfig = getUsageConfig(item.type);
      const currentLimit = stats.limits[usageConfig.quotaField];
      const isUnlimited = currentLimit === -1;
      const totalCost = getItemCost(item);
      const isAffordable = credits >= totalCost;

      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`shop_buy_${item.id}`)
          .setLabel(`${item.label} (${formatNumber(totalCost)})`)
          .setStyle(item.style)
          .setDisabled(disabled || isUnlimited || !isAffordable)
      );
    }

    rows.push(row);
  }

  return rows;
}

function buildNavigationRow(state, disabled = false) {
  const totalPages = getTotalPages(state.category);
  const singlePage = totalPages <= 1;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('shop_prev')
      .setLabel('<')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || singlePage || state.page === 0),
    new ButtonBuilder()
      .setCustomId('shop_refresh')
      .setLabel('Làm mới')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('shop_next')
      .setLabel('>')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || singlePage || state.page >= totalPages - 1)
  );
}

function buildShopMessage(user, credits, stats, state, disabled = false) {
  return {
    embeds: [buildShopEmbed(user, credits, stats, state)],
    components: [
      buildCategoryRow(state, disabled),
      ...buildItemRows(state, credits, stats, disabled),
      buildNavigationRow(state, disabled),
    ],
  };
}

async function loadShopState(user, state) {
  const [creditsData, quotaStats] = await Promise.all([
    CreditsService.getUserCredits(user.id),
    QuotaService.getUserMessageStats(user.id),
  ]);

  const totalPages = getTotalPages(state.category);
  const nextState = {
    category: state.category,
    page: Math.min(Math.max(state.page, 0), totalPages - 1),
  };

  return {
    state: nextState,
    credits: creditsData.credits,
    quotaStats,
  };
}

async function purchaseItem(userId, item) {
  const usageConfig = getUsageConfig(item.type);
  const totalCost = getItemCost(item);

  const quotaBefore = await QuotaService.getUserMessageStats(userId);
  const currentLimit = quotaBefore.limits[usageConfig.quotaField];

  if (currentLimit === -1) {
    throw new Error(`Tài khoản của bạn đang có lượt sử dụng ${usageConfig.productName} không giới hạn, không cần mua thêm quota.`);
  }

  const creditsBefore = await CreditsService.getUserCredits(userId);
  if (creditsBefore.credits < totalCost) {
    throw new Error(
      `Bạn không đủ credits. Cần **${formatNumber(totalCost)}** credits để mua **${formatNumber(item.amount)}** lượt sử dụng ${usageConfig.productName}.`
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
    .setDescription('Mở cửa hàng để mua quota bằng credits'),

  prefix: {
    name: 'shop',
    aliases: ['buyquota', 'muaturn', 'buyturn', 'muquota'],
    description: 'Mở cửa hàng quota của Lunaby',
  },
  cooldown: 5,

  async execute(interaction) {
    const user = interaction.user;
    const currentState = { category: 'quota', page: 0 };

    try {
      const initialData = await loadShopState(user, currentState);

      await interaction.reply(buildShopMessage(
        user,
        initialData.credits,
        initialData.quotaStats,
        initialData.state
      ));

      const message = await interaction.fetchReply();
      const collector = message.createMessageComponentCollector({ time: SHOP_TIMEOUT_MS });

      collector.on('collect', async (componentInteraction) => {
        if (componentInteraction.user.id !== user.id) {
          return componentInteraction.reply({
            content: 'Chỉ người mở shop mới có thể sử dụng giao diện này.',
            ephemeral: true,
          });
        }

        try {
          if (componentInteraction.isStringSelectMenu()) {
            if (componentInteraction.customId !== 'shop_category') {
              return;
            }

            currentState.category = componentInteraction.values[0];
            currentState.page = 0;

            const refreshedData = await loadShopState(user, currentState);
            await componentInteraction.update(buildShopMessage(
              user,
              refreshedData.credits,
              refreshedData.quotaStats,
              refreshedData.state
            ));
            return;
          }

          if (!componentInteraction.isButton()) {
            return;
          }

          if (componentInteraction.customId === 'shop_prev') {
            currentState.page = Math.max(0, currentState.page - 1);
            const refreshedData = await loadShopState(user, currentState);
            await componentInteraction.update(buildShopMessage(
              user,
              refreshedData.credits,
              refreshedData.quotaStats,
              refreshedData.state
            ));
            return;
          }

          if (componentInteraction.customId === 'shop_next') {
            currentState.page = Math.min(getTotalPages(currentState.category) - 1, currentState.page + 1);
            const refreshedData = await loadShopState(user, currentState);
            await componentInteraction.update(buildShopMessage(
              user,
              refreshedData.credits,
              refreshedData.quotaStats,
              refreshedData.state
            ));
            return;
          }

          if (componentInteraction.customId === 'shop_refresh') {
            const refreshedData = await loadShopState(user, currentState);
            await componentInteraction.update(buildShopMessage(
              user,
              refreshedData.credits,
              refreshedData.quotaStats,
              refreshedData.state
            ));
            return;
          }

          if (componentInteraction.customId.startsWith('shop_buy_')) {
            const itemId = componentInteraction.customId.replace('shop_buy_', '');
            const item = SHOP_ITEMS.find((entry) => entry.id === itemId);

            if (!item) {
              return componentInteraction.reply({
                content: `${emojis.error} Không tìm thấy gói bạn muốn mua.`,
                ephemeral: true,
              });
            }

            const purchaseResult = await purchaseItem(user.id, item);
            const refreshedData = {
              credits: purchaseResult.creditsAfter,
              quotaStats: purchaseResult.quotaAfter,
              state: {
                category: currentState.category,
                page: Math.min(currentState.page, getTotalPages(currentState.category) - 1),
              },
            };

            await componentInteraction.update(buildShopMessage(
              user,
              refreshedData.credits,
              refreshedData.quotaStats,
              refreshedData.state
            ));

            await componentInteraction.followUp({
              content:
                `${emojis.success} Bạn đã mua **${formatNumber(item.amount)}** lượt ${purchaseResult.usageConfig.productName} ` +
                `với giá **${formatNumber(purchaseResult.totalCost)}** credits.`,
              ephemeral: true,
            });
          }
        } catch (error) {
          logger.error('SHOP', 'Error while handling shop component:', error);

          const payload = {
            content: `${emojis.error} ${error.message || 'Đã xảy ra lỗi khi xử lý shop.'}`,
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
            true
          ));
        } catch (error) {
          logger.error('SHOP', 'Error while disabling shop components:', error);
        }
      });
    } catch (error) {
      logger.error('SHOP', 'Error in shop command:', error);
      const payload = {
        content: `${emojis.error} Đã xảy ra lỗi khi mở shop. Vui lòng thử lại sau.`,
        ephemeral: true,
      };

      const respond = interaction.replied || interaction.deferred
        ? interaction.followUp(payload)
        : interaction.reply(payload);
      await respond.catch(() => {});
    }
  },
};
