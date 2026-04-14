const { EmbedBuilder } = require('discord.js');
const logger = require('../../utils/core/logger.js');
const MariaModDB = require('../database/MariaModDB.js');
const emojis = require('../../config/emojis.js');
const { getCachedGuildSettings } = require('../../utils/guild/guildLocale.js');

const { createEmbed } = require('../../utils/discord/builderFactory');
let autoPoster = null;
let webhookApp = null;

/**
 * Khởi tạo AutoPoster để tự động gửi stats lên Top.gg
 * Yêu cầu: npm i topgg-autoposter
 * @param {import('discord.js').Client} client - client Discord
 */
async function setupAutoPoster(client) {
  const token = process.env.TOPGG_TOKEN;

  if (!token) {
    logger.warn('topgg', 'topgg_token not configured, skipping AutoPoster');
    return null;
  }

  try {
    const { AutoPoster } = require('topgg-autoposter');

    autoPoster = AutoPoster(token, client, {
      interval: 900000, // 15 phút (mặc định)
    });

    autoPoster.on('posted', (stats) => {
      logger.info('topgg', `Sent stats to Top.gg | Servers: ${stats.serverCount}`);
    });

    autoPoster.on('error', (err) => {
      logger.error('topgg', `AutoPoster error: ${err.message}`);
    });

    logger.info('topgg', 'AutoPoster initialized successfully');
    return autoPoster;
  } catch (error) {
    logger.error('topgg', `Failed to initialize AutoPoster: ${error.message}`);
    return null;
  }
}

/**
 * Gửi thông báo vote đến tất cả guild đã cấu hình kênh vote log
 * @param {import('discord.js').Client} client
 * @param {Object} vote - Dữ liệu vote từ Top.gg
 */
async function sendVoteNotifications(client, vote) {
  try {
    const user = await client.users.fetch(vote.user).catch(() => null);
    const displayName = user ? user.tag : vote.user;
    const avatarURL = user?.displayAvatarURL({ dynamic: true, size: 128 });
    const isWeekend = vote.isWeekend || false;

    for (const [guildId, guild] of client.guilds.cache) {
      try {
        const settings = await getCachedGuildSettings(guildId);
        const voteLogChannelId = settings.channels?.voteLog;

        if (!voteLogChannelId) continue;

        const channel = guild.channels.cache.get(voteLogChannelId);
        if (!channel) continue;

        const embed = createEmbed()
          .setColor(0xFF3366)
          .setTitle(`${emojis.topgg.vote} Có người vừa vote!`)
          .setDescription(`**${displayName}** đã vote cho bot trên [Top.gg](https://top.gg/bot/${vote.bot}/vote)!`)
          .addFields(
            { name: 'Người vote', value: `<@${vote.user}>`, inline: true },
            { name: 'Loại', value: vote.type === 'test' ? `${emojis.topgg.test} Test` : `${emojis.topgg.pass} Vote`, inline: true },
          )
          .setTimestamp();

        if (avatarURL) embed.setThumbnail(avatarURL);
        if (isWeekend) {
          embed.addFields({ name: `${emojis.topgg.weekend} Weekend Bonus`, value: 'Vote trong cuối tuần — x2 điểm!', inline: false });
        }

        embed.setFooter({ text: 'Top.gg Vote System' });

        await channel.send({ embeds: [embed] }).catch((err) => {
          logger.warn('topgg', `Failed to send vote log to guild ${guildId}: ${err.message}`);
        });
      } catch (error) {
        logger.error('topgg', `Error processing vote log for guild ${guildId}: ${error.message}`);
      }
    }
  } catch (error) {
    logger.error('topgg', `Error sending vote notification: ${error.message}`);
  }
}

/**
 * Khởi tạo Webhook listener để nhận sự kiện vote từ Top.gg
 * Yêu cầu: npm i @top-gg/sdk express
 * @param {import('discord.js').Client} client - client Discord
 * @param {Function} [onVote] - Callback khi có người vote (tùy chọn)
 */
async function setupWebhook(client, onVote) {
  const webhookAuth = process.env.TOPGG_WEBHOOK_AUTH;
  const webhookPort = parseInt(process.env.TOPGG_WEBHOOK_PORT) || 5000;
  const webhookPath = process.env.TOPGG_WEBHOOK_PATH || '/topggwebhook';

  if (!webhookAuth) {
    logger.warn('topgg', 'topgg_webhook_auth not configured, skipping Webhook');
    return null;
  }

  try {
    const Topgg = require('@top-gg/sdk');
    const express = require('express');

    const app = express();
    const webhook = new Topgg.Webhook(webhookAuth);

    app.post(webhookPath, webhook.listener(async (vote) => {
      logger.info('topgg', `Received vote from user: ${vote.user} | Bot: ${vote.bot} | Type: ${vote.type}`);

      // Gửi thông báo đến các guild đã cấu hình vote log
      await sendVoteNotifications(client, vote);

      // Gọi callback tùy chỉnh nếu có
      if (typeof onVote === 'function') {
        try {
          await onVote(vote, client);
        } catch (error) {
          logger.error('topgg', `Error processing vote callback: ${error.message}`);
        }
      }
    }));

    // Endpoint kiểm tra tình trạng
    app.get('/health', (req, res) => {
      res.status(200).json({ status: 'ok', service: 'topgg-webhook' });
    });

    const sslCert = process.env.TOPGG_SSL_CERT;
    const sslKey = process.env.TOPGG_SSL_KEY;

    if (sslCert && sslKey) {
      const https = require('https');
      const fs = require('fs');

      webhookApp = https.createServer({
        cert: fs.readFileSync(sslCert),
        key: fs.readFileSync(sslKey),
      }, app).listen(webhookPort, () => {
        logger.info('topgg', `Webhook https server is running on port ${webhookPort} (path: ${webhookPath})`);
      });
    } else {
      webhookApp = app.listen(webhookPort, () => {
        logger.info('topgg', `Webhook http server is running on port ${webhookPort} (path: ${webhookPath})`);
      });
    }

    return webhookApp;
  } catch (error) {
    logger.error('topgg', `Failed to initialize Webhook: ${error.message}`);
    return null;
  }
}

/**
 * Khởi tạo toàn bộ dịch vụ Top.gg (AutoPoster + Webhook)
 * @param {import('discord.js').Client} client - client Discord
 * @param {Function} [onVote] - Callback khi có người vote (tùy chọn)
 */
async function initializeTopgg(client, onVote) {
  const results = await Promise.allSettled([
    setupAutoPoster(client),
    setupWebhook(client, onVote),
  ]);

  const [posterResult, webhookResult] = results;

  if (posterResult.status === 'rejected') {
    logger.error('topgg', `AutoPoster init failed: ${posterResult.reason}`);
  }

  if (webhookResult.status === 'rejected') {
    logger.error('topgg', `Webhook init failed: ${webhookResult.reason}`);
  }

  return {
    autoPoster: posterResult.status === 'fulfilled' ? posterResult.value : null,
    webhook: webhookResult.status === 'fulfilled' ? webhookResult.value : null,
  };
}

/**
 * Dừng tất cả dịch vụ Top.gg
 */
function shutdownTopgg() {
  if (autoPoster) {
    try {
      autoPoster.stop?.();
      logger.info('topgg', 'AutoPoster stopped');
    } catch (error) {
      logger.error('topgg', `Error while stopping AutoPoster: ${error.message}`);
    }
  }

  if (webhookApp) {
    try {
      webhookApp.close();
      logger.info('topgg', 'Webhook server stopped');
    } catch (error) {
      logger.error('topgg', `Error while stopping Webhook: ${error.message}`);
    }
  }
}

module.exports = {
  setupAutoPoster,
  setupWebhook,
  initializeTopgg,
  shutdownTopgg,
};

