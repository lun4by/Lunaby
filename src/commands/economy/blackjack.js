const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
    MessageFlags,
} = require('discord.js');
const EconomyService = require('../../services/user/EconomyService');
const bjUtil = require('../../utils/economy/blackjackUtil');
const emojis = require('../../config/emojis');
const logger = require('../../utils/core/logger');

const { createEmbed } = require('../../utils/discord/builderFactory');
const BLACKJACK_TIMEOUT_MS = 60000;
const HIT_CUSTOM_ID = 'blackjack_hit';
const STAND_CUSTOM_ID = 'blackjack_stand';

const blackjackSessions = new Map();

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value);
}

function handScore(hand) {
  return bjUtil.cardValue(hand).points;
}

function determineWinner(playerScore, dealerScore) {
  if (playerScore > 21 && dealerScore > 21) return 'tb';
  if (playerScore === dealerScore) return 't';
  if (playerScore > 21) return 'l';
  if (dealerScore > 21) return 'w';
  if (playerScore > dealerScore) return 'w';
  return 'l';
}

function payoutFromWinner(winner, bet) {
  if (winner === 'w') return bet * 2;
  if (winner === 't' || winner === 'tb') return bet;
  return 0;
}

function buildActionRow(disabled = false, interaction) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(HIT_CUSTOM_ID)
      .setLabel(interaction.t('commands.blackjack.button_hit'))
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(STAND_CUSTOM_ID)
      .setLabel(interaction.t('commands.blackjack.button_stand'))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  );
}

function buildEmbed(interaction, game, options = {}) {
  const revealDealer = !!options.revealDealer;
  const footer = options.footer || interaction.t('commands.blackjack.embed_footer_progress');

  const playerInfo = bjUtil.cardValue(game.player);
  const dealerInfo = bjUtil.cardValue(game.dealer);
  const playerScoreLabel = playerInfo.ace ? `${playerInfo.points}*` : String(playerInfo.points);

  const dealerScoreText = revealDealer
    ? String(dealerInfo.points)
    : interaction.t('commands.blackjack.dealer_score_hidden', { shown: dealerInfo.shownPoints });

  const embed = createEmbed()
    .setColor(0x2b2d31)
    .setTitle(interaction.t('commands.blackjack.embed_title'))
    .setDescription(interaction.t('commands.blackjack.embed_bet', { bet: formatNumber(game.bet) }))
    .addFields(
      {
        name: interaction.t('commands.blackjack.dealer_field', { score: dealerScoreText }),
        value: dealerInfo.display,
        inline: true,
      },
      {
        name: interaction.t('commands.blackjack.player_field', {
          user: game.displayName,
          score: playerScoreLabel,
        }),
        value: playerInfo.display,
        inline: true,
      },
    )
    .setFooter({ text: footer });

  return embed;
}

function buildResultHeader(interaction, winner) {
  if (winner === 'w') return `${emojis.success} ${interaction.t('commands.blackjack.result_win')}`;
  if (winner === 't') return `${emojis.info} ${interaction.t('commands.blackjack.result_push')}`;
  if (winner === 'tb') return `${emojis.info} ${interaction.t('commands.blackjack.result_both_bust')}`;
  return `${emojis.error} ${interaction.t('commands.blackjack.result_lose')}`;
}

function buildFooterByWinner(interaction, winner) {
  if (winner === 'w') return interaction.t('commands.blackjack.embed_footer_win');
  if (winner === 't') return interaction.t('commands.blackjack.embed_footer_push');
  if (winner === 'tb') return interaction.t('commands.blackjack.embed_footer_both_bust');
  return interaction.t('commands.blackjack.embed_footer_lose');
}

async function settleAndRender(game, interaction, source = 'stand') {
  if (game.ended) return;
  game.ended = true;

  for (const card of game.player) {
    card.type = 'c';
  }

  for (const card of game.dealer) {
    if (card.type === 'b') card.type = 'f';
    else card.type = 'c';
  }

  while (handScore(game.dealer) < 17) {
    game.dealer.push(bjUtil.randCard(game.deck, 'f'));
  }

  const playerScore = handScore(game.player);
  const dealerScore = handScore(game.dealer);
  const winner = determineWinner(playerScore, dealerScore);
  const payout = payoutFromWinner(winner, game.bet);
  const settlement = await EconomyService.settleBlackjack(game.userId, payout);

  const netDelta = payout - game.bet;
  const deltaText = `${netDelta > 0 ? '+' : ''}${formatNumber(netDelta)}`;
  const resultHeader = buildResultHeader(interaction, winner);
  const resultBody = interaction.t('commands.blackjack.bet_and_change', {
    bet: formatNumber(game.bet),
    delta: deltaText,
  });
  const balanceText = interaction.t('commands.blackjack.balance', {
    balance: formatNumber(settlement.walletAfter),
  });

  let footer = buildFooterByWinner(interaction, winner);
  if (source === 'timeout') {
    footer = `${interaction.t('commands.blackjack.embed_footer_timeout')} | ${footer}`;
  }

  const payload = {
    content: `${resultHeader}\n${resultBody}\n${balanceText}`,
    embeds: [buildEmbed(interaction, game, { revealDealer: true, footer })],
    components: [buildActionRow(true, interaction)],
  };

  blackjackSessions.delete(game.userId);
  return payload;
}

function buildErrorPayload(isSlash, content) {
  return isSlash ? { content, flags: MessageFlags.Ephemeral } : content;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('blackjack')
    .setDescription('Đánh blackjack theo lượt hit hoặc stand')
    .addStringOption((option) =>
      option.setName('bet')
        .setDescription('Số credits đặt cược (hoặc all)')
        .setRequired(true)),
  prefix: {
    name: 'blackjack',
    aliases: ['bj', '21'],
    description: 'Đánh blackjack theo lượt hit/stand',
  },
  cooldown: 12,

  async execute(interaction) {
    const isSlash = !interaction.message;

    await interaction.reply(buildErrorPayload(
      isSlash,
      `${emojis.warning} ${interaction.t('commands.blackjack.maintenance')}`,
    ));
    return;

    let reservedBet = 0;
    let sessionCreated = false;

    try {
      const betRaw = isSlash
        ? interaction.options.getString('bet')
        : interaction.args?.[0];

      if (!betRaw) {
        await interaction.reply(buildErrorPayload(
          isSlash,
          `${emojis.error} ${interaction.t('commands.blackjack.syntax')}`,
        ));
        return;
      }

      const existing = blackjackSessions.get(interaction.user.id);
      if (existing && !existing.ended) {
        if (existing.channelId && existing.channelId !== interaction.channelId) {
          await interaction.reply(buildErrorPayload(
            isSlash,
            `${emojis.warning} ${interaction.t('commands.blackjack.in_progress_other_channel')}`,
          ));
          return;
        }

        existing.collector?.stop('replaced');
        const resumedReply = await interaction.reply({
          content: `${emojis.info} ${interaction.t('commands.blackjack.resumed')}`,
          embeds: [buildEmbed(interaction, existing, { footer: interaction.t('commands.blackjack.embed_footer_resumed') })],
          components: [buildActionRow(false, interaction)],
        });
        const resumedMessage = isSlash ? await interaction.fetchReply() : resumedReply;

        const collector = resumedMessage.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: BLACKJACK_TIMEOUT_MS,
        });

        existing.collector = collector;
        existing.channelId = resumedMessage.channelId;
        existing.messageId = resumedMessage.id;

        collector.on('collect', async (btnInteraction) => {
          if (btnInteraction.user.id !== existing.userId) {
            await btnInteraction.reply({
              content: interaction.t('system.only_caller_can_use'),
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          try {
            if (btnInteraction.customId === HIT_CUSTOM_ID) {
              for (const card of existing.player) {
                card.type = 'c';
              }

              for (const card of existing.dealer) {
                if (card.type === 'f') card.type = 'c';
              }

              existing.player.push(bjUtil.randCard(existing.deck, 'f'));
              if (handScore(existing.player) > 21) {
                const finalPayload = await settleAndRender(existing, interaction, 'hit');
                collector.stop('completed');
                await btnInteraction.update(finalPayload);
                return;
              }

              await btnInteraction.update({
                embeds: [buildEmbed(interaction, existing)],
                components: [buildActionRow(false, interaction)],
              });
              return;
            }

            if (btnInteraction.customId === STAND_CUSTOM_ID) {
              const finalPayload = await settleAndRender(existing, interaction, 'stand');
              collector.stop('completed');
              await btnInteraction.update(finalPayload);
            }
          } catch (error) {
            logger.error('blackjack', 'Error while handling blackjack button (resume):', error);
            await btnInteraction.reply({
              content: `${emojis.error} ${interaction.t('commands.blackjack.error')}`,
              flags: MessageFlags.Ephemeral,
            }).catch(() => { });
          }
        });

        collector.on('end', async (_collected, reason) => {
          if (reason === 'completed' || reason === 'replaced' || existing.ended) {
            return;
          }

          try {
            const finalPayload = await settleAndRender(existing, interaction, 'timeout');
            await resumedMessage.edit(finalPayload).catch(() => { });
          } catch (error) {
            logger.error('blackjack', 'Error finalizing resumed blackjack on timeout:', error);
          }
        });

        return;
      }

      const balance = await EconomyService.getBalance(interaction.user.id);
      const bet = EconomyService.resolveBetAmount(betRaw, balance);

      await EconomyService.beginBlackjack(interaction.user.id, bet);
      reservedBet = bet;

      const deck = bjUtil.createDeck();
      const game = {
        userId: interaction.user.id,
        displayName: interaction.user.globalName || interaction.user.username,
        bet,
        deck,
        player: [bjUtil.randCard(deck, 'f'), bjUtil.randCard(deck, 'f')],
        dealer: [bjUtil.randCard(deck, 'f'), bjUtil.randCard(deck, 'b')],
        collector: null,
        ended: false,
        channelId: interaction.channelId,
        messageId: null,
      };

      blackjackSessions.set(interaction.user.id, game);
      sessionCreated = true;

      const replyResult = await interaction.reply({
        content: `${emojis.info} ${interaction.t('commands.blackjack.started')}`,
        embeds: [buildEmbed(interaction, game)],
        components: [buildActionRow(false, interaction)],
      });
      const message = isSlash ? await interaction.fetchReply() : replyResult;

      game.messageId = message.id;
      game.channelId = message.channelId;

      const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: BLACKJACK_TIMEOUT_MS,
      });

      game.collector = collector;

      collector.on('collect', async (btnInteraction) => {
        if (btnInteraction.user.id !== game.userId) {
          await btnInteraction.reply({
            content: interaction.t('system.only_caller_can_use'),
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        try {
          if (btnInteraction.customId === HIT_CUSTOM_ID) {
            for (const card of game.player) {
              card.type = 'c';
            }

            for (const card of game.dealer) {
              if (card.type === 'f') card.type = 'c';
            }

            game.player.push(bjUtil.randCard(game.deck, 'f'));
            if (handScore(game.player) > 21) {
              const finalPayload = await settleAndRender(game, interaction, 'hit');
              collector.stop('completed');
              await btnInteraction.update(finalPayload);
              return;
            }

            await btnInteraction.update({
              embeds: [buildEmbed(interaction, game)],
              components: [buildActionRow(false, interaction)],
            });
            return;
          }

          if (btnInteraction.customId === STAND_CUSTOM_ID) {
            const finalPayload = await settleAndRender(game, interaction, 'stand');
            collector.stop('completed');
            await btnInteraction.update(finalPayload);
          }
        } catch (error) {
          logger.error('blackjack', 'Error while handling blackjack button:', error);
          await btnInteraction.reply({
            content: `${emojis.error} ${interaction.t('commands.blackjack.error')}`,
            flags: MessageFlags.Ephemeral,
          }).catch(() => { });
        }
      });

      collector.on('end', async (_collected, reason) => {
        if (reason === 'completed' || reason === 'replaced' || game.ended) {
          return;
        }

        try {
          const finalPayload = await settleAndRender(game, interaction, 'timeout');
          await message.edit(finalPayload).catch(() => { });
        } catch (error) {
          logger.error('blackjack', 'Error finalizing blackjack on timeout:', error);
        }
      });
    } catch (error) {
      if (reservedBet > 0 && !sessionCreated) {
        try {
          await EconomyService.settleBlackjack(interaction.user.id, reservedBet);
        } catch (refundError) {
          logger.error('blackjack', 'Failed to refund blackjack bet after start error:', refundError);
        }
      }

      logger.error('blackjack', 'Error in blackjack command:', error);
      await interaction.reply(buildErrorPayload(
        isSlash,
        `${emojis.error} ${error.message || interaction.t('commands.blackjack.error')}`,
      )).catch(() => { });
    }
  },
};