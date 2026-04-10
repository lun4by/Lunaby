const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} = require('discord.js');
const BlacklistService = require('../services/user/BlacklistService');
const logger = require('./logger');

const SUPPORT_SERVER_URL = process.env.SUPPORT_SERVER_URL || 'https://discord.gg/NFF7tw2zNQ';
const DM_NOTIFY_COOLDOWN_MS = 60 * 60 * 1000;

const notifiedUsers = new Map();

function buildSupportServerRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Hỗ trợ')
      .setStyle(ButtonStyle.Link)
      .setURL(SUPPORT_SERVER_URL),
  );
}

function shouldNotifyUser(userId) {
  const now = Date.now();
  const lastNotifiedAt = notifiedUsers.get(userId) || 0;

  if (now - lastNotifiedAt < DM_NOTIFY_COOLDOWN_MS) {
    return false;
  }

  notifiedUsers.set(userId, now);
  return true;
}

async function notifyBlacklistedUser(user, reason = null) {
  if (!user || user.bot || !shouldNotifyUser(user.id)) {
    return false;
  }

  const lines = [
    'Tài khoản của bạn hiện đang nằm trong blacklist của Lunaby nên bot sẽ không phản hồi yêu cầu của bạn.',
  ];

  if (reason) {
    lines.push(`Lý do: ${reason}`);
  }

  lines.push('Nếu bạn cần hỗ trợ hoặc khiếu nại, hãy bấm nút Hỗ trợ bên dưới.');

  try {
    await user.send({
      content: lines.join('\n'),
      components: [buildSupportServerRow()],
    });
    return true;
  } catch (error) {
    logger.warn('blacklist', `Failed to send DM to user blacklist ${user.id}: ${error.message}`);
    return false;
  }
}

function findNoticeChannel(guild) {
  if (!guild || !guild.members?.me) return null;

  const canSend = (channel) =>
    channel &&
    channel.type === ChannelType.GuildText &&
    channel.permissionsFor(guild.members.me)?.has(['ViewChannel', 'SendMessages']);

  return guild.systemChannel && canSend(guild.systemChannel)
    ? guild.systemChannel
    : guild.channels.cache.find((channel) => canSend(channel) && /general|chung|welcome/i.test(channel.name))
      || guild.channels.cache.find((channel) => canSend(channel))
      || null;
}

async function notifyBlacklistedGuildAndLeave(guild, reason = null) {
  if (!guild) return false;

  const lines = [
    'Server này hiện đang nằm trong blacklist của Lunaby nên bot sẽ tự rời khỏi server.',
  ];

  if (reason) {
    lines.push(`Lý do: ${reason}`);
  }

  lines.push('Nếu bạn cần hỗ trợ hoặc khiếu nại, hãy bấm nút Hỗ trợ bên dưới.');

  try {
    const channel = findNoticeChannel(guild);
    if (channel) {
      await channel.send({
        content: lines.join('\n'),
        components: [buildSupportServerRow()],
      }).catch(() => { });
    }
  } catch (error) {
    logger.warn('blacklist', `Failed to send blacklist notice to guild ${guild.id}: ${error.message}`);
  }

  try {
    await guild.leave();
    logger.info('blacklist', `Bot left blacklisted guild ${guild.name} (${guild.id})`);
    return true;
  } catch (error) {
    logger.error('blacklist', `Failed to leave blacklisted guild ${guild.name} (${guild.id}):`, error);
    return false;
  }
}

async function shouldBlockUser(user) {
  if (!user || user.bot) return null;
  return BlacklistService.isUserBlacklisted(user.id);
}

async function shouldBlockGuild(guild) {
  if (!guild) return null;
  return BlacklistService.isGuildBlacklisted(guild.id);
}

module.exports = {
  SUPPORT_SERVER_URL,
  buildSupportServerRow,
  notifyBlacklistedUser,
  notifyBlacklistedGuildAndLeave,
  shouldBlockUser,
  shouldBlockGuild,
};
