const PrefixDB = require('../services/database/PrefixDB');
const logger = require('../utils/core/logger');
const emojis = require('../config/emojis');
const {
  ensureCommandCooldown,
  ensureCommandEnabledInChannel,
  ensureMemberPermissions,
  ensureUserConsent,
  getCommandCooldownSeconds,
  getRequiredMemberPermissions,
  resolveCommandAccess,
  resolveCommandLocale,
  setCommandCooldown,
} = require('./commands/commandGuards');
const { findCommandByPrefix } = require('./commands/commandRegistry');
const { PseudoInteraction } = require('./commands/prefixCommandRuntime');
const CommandNoticeService = require('../services/system/CommandNoticeService');

async function handlePrefixMessage(message, client) {
  if (message.author.bot) {
    return false;
  }

  if (typeof message.t !== 'function') {
    await resolveCommandLocale(message, message.guildId);
  }

  const prefix = await PrefixDB.resolvePrefix(message.author.id, message.guild?.id);
  if (!message.content.toLowerCase().startsWith(prefix.toLowerCase())) {
    return false;
  }

  const withoutPrefix = message.content.slice(prefix.length).trim();
  if (!withoutPrefix) {
    return false;
  }

  const args = withoutPrefix.split(/\s+/);
  const commandName = args.shift().toLowerCase();
  const command = findCommandByPrefix(client, commandName);
  if (!command) {
    return false;
  }

  const resolvedCommandName = command.data?.name || commandName;

  try {
    logger.info(
      'command_usage',
      `[prefix] [Server: ${message.guild?.name || 'DM'}] [Channel: ${message.channel?.name || 'N/A'}] User ${message.author.tag} (${message.author.id}) used: ${prefix}${commandName}`,
    );

    const { userRole, isPrivileged } = await resolveCommandAccess(message.author.id);
    logger.info('prefix', `Role resolved for ${message.author.id}: ${userRole}`);

    if (!(await ensureUserConsent(message, message.author))) {
      return true;
    }

    if (command.prefix?.adminOnly && !isPrivileged) {
      await message.reply(`${emojis.error} ${message.t('system.no_permission')}`).catch(() => { });
      return true;
    }

    if (!(await ensureMemberPermissions({
      member: message.member,
      requiredPermissions: getRequiredMemberPermissions(command),
      deny: () => message.reply(`${emojis.error} ${message.t('system.missing_server_permissions')}`).catch(() => { }),
    }))) {
      return true;
    }

    if (!(await ensureCommandEnabledInChannel({
      guildId: message.guildId,
      channelId: message.channelId,
      commandName: resolvedCommandName,
      deny: () => message.reply(`${emojis.error} ${message.t('system.command_disabled_in_channel')}`).catch(() => { }),
    }))) {
      return true;
    }

    const cooldownSeconds = getCommandCooldownSeconds(command);
    if (!(await ensureCommandCooldown({
      userId: message.author.id,
      commandName: resolvedCommandName,
      cooldownSeconds,
      isPrivileged,
      deny: async ({ remaining, expiresAtUnix }) => {
        const reply = await message.reply(message.t('system.cooldown_wait', { expiresAtUnix }));
        setTimeout(() => reply.delete().catch(() => { }), remaining * 1000);
      },
    }))) {
      return true;
    }

    const interaction = new PseudoInteraction(message, commandName, args, command);
    await command.execute(interaction);

    setCommandCooldown(message.author.id, resolvedCommandName, cooldownSeconds);
    await CommandNoticeService.appendActiveNotice(interaction);
  } catch (error) {
    logger.error('prefix', `Error executing prefix command ${resolvedCommandName}:`, error);
    await message.reply(`${emojis.error} ${message.t('system.command_execution_failed')}`).catch(() => { });
  }

  return true;
}

module.exports = {
  handlePrefixMessage,
  PseudoInteraction,
};
