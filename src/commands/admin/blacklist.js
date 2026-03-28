const { SlashCommandBuilder } = require('discord.js');
const BlacklistService = require('../../services/user/BlacklistService');
const { notifyBlacklistedGuildAndLeave } = require('../../utils/blacklistUtils');
const logger = require('../../utils/logger');
const emojis = require('../../config/emojis');

function isSnowflake(value) {
  return /^\d{17,20}$/.test(value || '');
}

function formatReason(reason) {
  return reason?.trim() || 'Không có';
}

function formatListLine(entry, type) {
  const targetId = type === 'user' ? entry.user_id : entry.guild_id;
  const reason = formatReason(entry.reason);
  return `- \`${targetId}\` | ${reason}`;
}

async function reply(interaction, payload) {
  if (interaction.replied || interaction.deferred) {
    return interaction.followUp(payload);
  }

  return interaction.reply(payload);
}

function parsePrefixCommand(interaction) {
  const [scopeRaw, actionRaw, ...restArgs] = interaction.args || [];
  return {
    scope: scopeRaw?.toLowerCase() || null,
    action: actionRaw?.toLowerCase() || null,
    restArgs,
  };
}

function extractUserTargetFromPrefix(interaction, restArgs) {
  const mentionedUser = interaction.message?.mentions?.users?.first() || null;
  const rawUserId = restArgs.find(isSnowflake) || mentionedUser?.id || null;
  const reason = restArgs
    .filter((arg) => !arg.match(/^<@!?\d+>$/) && !isSnowflake(arg))
    .join(' ')
    .trim();

  return {
    user: mentionedUser,
    userId: rawUserId,
    reason,
  };
}

function extractGuildTargetFromPrefix(interaction, restArgs, action) {
  const rawGuildId = restArgs.find(isSnowflake) || (action === 'add' ? interaction.guildId : null);
  const reason = restArgs
    .filter((arg) => !isSnowflake(arg))
    .join(' ')
    .trim();

  return {
    guildId: rawGuildId,
    reason,
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('blacklist')
    .setDescription('Quản lý blacklist user và server của bot')
    .addSubcommandGroup((group) =>
      group
        .setName('user')
        .setDescription('Quản lý blacklist user')
        .addSubcommand((sub) =>
          sub
            .setName('add')
            .setDescription('Thêm user vào blacklist')
            .addUserOption((option) =>
              option.setName('user')
                .setDescription('User cần blacklist')
                .setRequired(true))
            .addStringOption((option) =>
              option.setName('reason')
                .setDescription('Lý do blacklist')
                .setRequired(false)))
        .addSubcommand((sub) =>
          sub
            .setName('remove')
            .setDescription('Gỡ user khỏi blacklist')
            .addStringOption((option) =>
              option.setName('user_id')
                .setDescription('ID user cần gỡ blacklist')
                .setRequired(true))))
    .addSubcommandGroup((group) =>
      group
        .setName('server')
        .setDescription('Quản lý blacklist server')
        .addSubcommand((sub) =>
          sub
            .setName('add')
            .setDescription('Thêm server vào blacklist')
            .addStringOption((option) =>
              option.setName('server_id')
                .setDescription('ID server, để trống để dùng server hiện tại')
                .setRequired(false))
            .addStringOption((option) =>
              option.setName('reason')
                .setDescription('Lý do blacklist')
                .setRequired(false)))
        .addSubcommand((sub) =>
          sub
            .setName('remove')
            .setDescription('Gỡ server khỏi blacklist')
            .addStringOption((option) =>
              option.setName('server_id')
                .setDescription('ID server cần gỡ blacklist')
                .setRequired(true))))
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('Xem danh sách blacklist hiện tại')
        .addStringOption((option) =>
          option.setName('type')
            .setDescription('Loại blacklist muốn xem')
            .setRequired(true)
            .addChoices(
              { name: 'Tất cả', value: 'all' },
              { name: 'User', value: 'user' },
              { name: 'Server', value: 'server' },
            ))),
  prefix: {
    name: 'blacklist',
    aliases: ['bl'],
    description: 'Quản lý blacklist user và server của bot',
    adminOnly: true,
  },
  cooldown: 5,

  async execute(interaction) {
    const isSlash = !interaction.message;

    try {
      if (isSlash) {
        const group = interaction.options.getSubcommandGroup(false);
        const action = interaction.options.getSubcommand();

        if (group === 'user' && action === 'add') {
          const targetUser = interaction.options.getUser('user');
          const reason = interaction.options.getString('reason');

          await BlacklistService.addUser(targetUser.id, reason, interaction.user.id);
          return reply(interaction, {
            content: `${emojis.success} Đã thêm user \`${targetUser.id}\` vào blacklist.`,
            ephemeral: true,
          });
        }

        if (group === 'user' && action === 'remove') {
          const userId = interaction.options.getString('user_id');
          if (!isSnowflake(userId)) {
            return reply(interaction, {
              content: `${emojis.error} ID user không hợp lệ.`,
              ephemeral: true,
            });
          }

          const removed = await BlacklistService.removeUser(userId);
          return reply(interaction, {
            content: removed
              ? `${emojis.success} Đã gỡ user \`${userId}\` khỏi blacklist.`
              : `${emojis.error} User \`${userId}\` không nằm trong blacklist.`,
            ephemeral: true,
          });
        }

        if (group === 'server' && action === 'add') {
          const guildId = interaction.options.getString('server_id') || interaction.guildId;
          const reason = interaction.options.getString('reason');

          if (!isSnowflake(guildId)) {
            return reply(interaction, {
              content: `${emojis.error} Vui lòng cung cấp ID server hợp lệ hoặc dùng lệnh ngay trong server muốn blacklist.`,
              ephemeral: true,
            });
          }

          await BlacklistService.addGuild(guildId, reason, interaction.user.id);
          await reply(interaction, {
            content: `${emojis.success} Đã thêm server \`${guildId}\` vào blacklist.`,
            ephemeral: true,
          });

          const liveGuild = interaction.client.guilds.cache.get(guildId);
          if (liveGuild) {
            await notifyBlacklistedGuildAndLeave(liveGuild, reason);
          }
          return;
        }

        if (group === 'server' && action === 'remove') {
          const guildId = interaction.options.getString('server_id');
          if (!isSnowflake(guildId)) {
            return reply(interaction, {
              content: `${emojis.error} ID server không hợp lệ.`,
              ephemeral: true,
            });
          }

          const removed = await BlacklistService.removeGuild(guildId);
          return reply(interaction, {
            content: removed
              ? `${emojis.success} Đã gỡ server \`${guildId}\` khỏi blacklist.`
              : `${emojis.error} Server \`${guildId}\` không nằm trong blacklist.`,
            ephemeral: true,
          });
        }

        if (action === 'list') {
          const type = interaction.options.getString('type');
          const users = type === 'server' ? [] : await BlacklistService.getUsers(20);
          const guilds = type === 'user' ? [] : await BlacklistService.getGuilds(20);

          const blocks = [];
          if (type !== 'server') {
            blocks.push(`**User blacklist (${users.length})**\n${users.length ? users.map((entry) => formatListLine(entry, 'user')).join('\n') : 'Không có dữ liệu.'}`);
          }
          if (type !== 'user') {
            blocks.push(`**Server blacklist (${guilds.length})**\n${guilds.length ? guilds.map((entry) => formatListLine(entry, 'server')).join('\n') : 'Không có dữ liệu.'}`);
          }

          return reply(interaction, {
            content: blocks.join('\n\n'),
            ephemeral: true,
          });
        }
      }

      const { scope, action, restArgs } = parsePrefixCommand(interaction);

      if (scope === 'list') {
        const type = (action || 'all').toLowerCase();
        const users = type === 'server' ? [] : await BlacklistService.getUsers(20);
        const guilds = type === 'user' ? [] : await BlacklistService.getGuilds(20);
        const parts = [];

        if (type !== 'server') {
          parts.push(`User blacklist (${users.length})\n${users.length ? users.map((entry) => formatListLine(entry, 'user')).join('\n') : 'Không có dữ liệu.'}`);
        }
        if (type !== 'user') {
          parts.push(`Server blacklist (${guilds.length})\n${guilds.length ? guilds.map((entry) => formatListLine(entry, 'server')).join('\n') : 'Không có dữ liệu.'}`);
        }

        return interaction.reply(parts.join('\n\n'));
      }

      if (scope === 'user') {
        const { userId, reason } = extractUserTargetFromPrefix(interaction, restArgs);
        if (!userId) {
          return interaction.reply(`${emojis.error} Vui lòng mention user hoặc nhập ID user hợp lệ.`);
        }

        if (action === 'add') {
          await BlacklistService.addUser(userId, reason, interaction.user.id);
          return interaction.reply(`${emojis.success} Đã thêm user \`${userId}\` vào blacklist.`);
        }

        if (action === 'remove') {
          const removed = await BlacklistService.removeUser(userId);
          return interaction.reply(
            removed
              ? `${emojis.success} Đã gỡ user \`${userId}\` khỏi blacklist.`
              : `${emojis.error} User \`${userId}\` không nằm trong blacklist.`
          );
        }
      }

      if (scope === 'server') {
        const { guildId, reason } = extractGuildTargetFromPrefix(interaction, restArgs, action);
        if (!guildId) {
          return interaction.reply(`${emojis.error} Vui lòng nhập ID server hợp lệ hoặc dùng lệnh trong server cần blacklist.`);
        }

        if (action === 'add') {
          await BlacklistService.addGuild(guildId, reason, interaction.user.id);
          await interaction.reply(`${emojis.success} Đã thêm server \`${guildId}\` vào blacklist.`);

          const liveGuild = interaction.client.guilds.cache.get(guildId);
          if (liveGuild) {
            await notifyBlacklistedGuildAndLeave(liveGuild, reason);
          }
          return;
        }

        if (action === 'remove') {
          const removed = await BlacklistService.removeGuild(guildId);
          return interaction.reply(
            removed
              ? `${emojis.success} Đã gỡ server \`${guildId}\` khỏi blacklist.`
              : `${emojis.error} Server \`${guildId}\` không nằm trong blacklist.`
          );
        }
      }

      return interaction.reply(
        `${emojis.error} Cú pháp không hợp lệ. Dùng: \`blacklist user add/remove\`, \`blacklist server add/remove\`, hoặc \`blacklist list [all|user|server]\`.`
      );
    } catch (error) {
      logger.error('BLACKLIST', 'Error in blacklist command:', error);
      return reply(interaction, {
        content: `${emojis.error} ${error.message || 'Đã xảy ra lỗi khi xử lý blacklist.'}`,
        ephemeral: true,
      }).catch(() => { });
    }
  },
};
