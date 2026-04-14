const {SlashCommandBuilder, PermissionFlagsBits, MessageFlags} = require('discord.js');
const CommandNoticeService = require('../../services/system/CommandNoticeService');
const emojis = require('../../config/emojis');
const logger = require('../../utils/core/logger');

function toUnix(value) {
  return Math.floor(new Date(value).getTime() / 1000);
}

function parsePrefixCreateArgs(args) {
  const hours = Math.trunc(Number(args?.[1] || 0));
  const rawScope = String(args?.[2] || 'guild').toLowerCase();
  const scope = ['guild', 'global'].includes(rawScope) ? rawScope : 'guild';

  const messageStartIndex = ['guild', 'global'].includes(rawScope) ? 3 : 2;
  const message = (args || []).slice(messageStartIndex).join(' ').trim();

  return { hours, scope, message };
}

function parsePrefixAction(args) {
  return String(args?.[0] || 'list').toLowerCase();
}

function formatNoticeLine(notice, interaction) {
  const scope = notice.guildId ? `guild:${notice.guildId}` : 'global';
  const status = notice.isActive
    ? interaction.t('commands.notice.status_active')
    : interaction.t('commands.notice.status_inactive');
  return interaction.t('commands.notice.line', {
    id: notice.id,
    status,
    scope,
    expiresAtUnix: toUnix(notice.expiresAt),
    message: notice.message,
  });
}

function resolveNoticeErrorMessage(interaction, error) {
  if (error?.code === 'NOTICE_INVALID_HOURS') {
    return interaction.t('commands.notice.errors.invalid_hours');
  }

  if (error?.code === 'NOTICE_EMPTY_MESSAGE') {
    return interaction.t('commands.notice.errors.empty_message');
  }

  if (error?.code === 'NOTICE_INVALID_ID') {
    return interaction.t('commands.notice.errors.invalid_id');
  }

  if (error?.message) {
    return error.message;
  }

  return interaction.t('commands.notice.error');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('notice')
    .setDescription('Quản lý thông báo hiển thị bên dưới mọi lệnh')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Tạo thông báo mới có thời hạn')
        .addStringOption((option) =>
          option.setName('message')
            .setDescription('Nội dung thông báo')
            .setRequired(true))
        .addIntegerOption((option) =>
          option.setName('hours')
            .setDescription('Số giờ hiệu lực (1-720)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(720))
        .addStringOption((option) =>
          option.setName('scope')
            .setDescription('Phạm vi thông báo')
            .setRequired(false)
            .addChoices(
              { name: 'Guild hiện tại', value: 'guild' },
              { name: 'Toàn bộ bot (global)', value: 'global' }
            )))
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('Xem danh sách thông báo'))
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Tắt một thông báo theo ID')
        .addIntegerOption((option) =>
          option.setName('id')
            .setDescription('ID thông báo')
            .setRequired(true)
            .setMinValue(1))),

  prefix: {
    name: 'notice',
    aliases: ['noticepush'],
    description: 'Quản lý thông báo hiển thị dưới lệnh',
    adminOnly: true,
  },
  cooldown: 3,

  async execute(interaction) {
    const isSlash = !interaction.message;

    try {
      const action = isSlash
        ? interaction.options.getSubcommand()
        : parsePrefixAction(interaction.args);

      if (action === 'create') {
        let message;
        let hours;
        let scope;

        if (isSlash) {
          message = interaction.options.getString('message');
          hours = interaction.options.getInteger('hours');
          scope = interaction.options.getString('scope') || 'guild';
        } else {
          const parsed = parsePrefixCreateArgs(interaction.args);
          message = parsed.message;
          hours = parsed.hours;
          scope = parsed.scope;
        }

        if (!message || !hours) {
          await interaction.reply({
            content: `${emojis.error} ${interaction.t('commands.notice.syntax_create')}`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const guildId = scope === 'global' ? null : interaction.guildId;
        const created = await CommandNoticeService.createNotice({
          message,
          guildId,
          hours,
          createdBy: interaction.user.id,
        });

        await interaction.reply(
          `${emojis.success} ${interaction.t('commands.notice.create_success', {
            id: created.id,
            scope,
            expiresAtUnix: toUnix(created.expiresAt),
            message: created.message,
          })}`
        );
        return;
      }

      if (action === 'remove') {
        const id = isSlash
          ? interaction.options.getInteger('id')
          : Math.trunc(Number(interaction.args?.[1] || 0));

        const removed = await CommandNoticeService.removeNotice(id);
        await interaction.reply(
          removed
            ? `${emojis.success} ${interaction.t('commands.notice.remove_success', { id })}`
            : `${emojis.warning} ${interaction.t('commands.notice.remove_not_found', { id })}`
        );
        return;
      }

      const notices = await CommandNoticeService.listNotices(interaction.guildId || null, 10);
      if (!notices.length) {
        await interaction.reply(`${emojis.info} ${interaction.t('commands.notice.no_notice')}`);
        return;
      }

      const content = notices.map((notice) => formatNoticeLine(notice, interaction)).join('\n');
      await interaction.reply(content.slice(0, 1900));
    } catch (error) {
      logger.error('notice', 'Error in notice command:', error);
      await interaction.reply({
        content: `${emojis.error} ${resolveNoticeErrorMessage(interaction, error)}`,
        flags: MessageFlags.Ephemeral,
      }).catch(() => { });
    }
  },
};