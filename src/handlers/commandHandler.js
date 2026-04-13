const logger = require('../utils/core/logger.js');
const emojis = require('../config/emojis');
const {
  ensureCommandCooldown,
  ensureCommandEnabledInChannel,
  ensureCommandUnlocked,
  ensureMemberPermissions,
  ensureUserConsent,
  getCommandCooldownSeconds,
  getRequiredMemberPermissions,
  resolveCommandAccess,
  resolveCommandLocale,
  setCommandCooldown,
} = require('./commands/commandGuards');
const {
  getCommandByName,
  getCommandsJson,
  loadCommands,
} = require('./commands/commandRegistry');
const CommandNoticeService = require('../services/system/CommandNoticeService');

const handleCommand = async (interaction, client) => {
  if (!client.commands.size) {
    logger.warn('command', 'Commands not loaded, reloading...');
    loadCommands(client);
  }

  const command = getCommandByName(client, interaction.commandName);
  if (!command) {
    logger.error('command', `No command found matching ${interaction.commandName}.`);
    return;
  }

  try {
    logger.info(
      'command',
      `Handling /${interaction.commandName} | user=${interaction.user?.tag} (${interaction.user?.id}) | guild=${interaction.guild?.name || 'DM'} (${interaction.guildId || 'DM'}) | channel=${interaction.channel?.name || 'N/A'} (${interaction.channelId || 'N/A'})`,
    );

    const locale = await resolveCommandLocale(interaction, interaction.guildId);
    if (interaction.guildId) {
      logger.info('command', `Guild locale resolved for /${interaction.commandName}: ${locale}`);
    }
    logger.info('command', `Effective locale for /${interaction.commandName}: ${locale}`);

    logger.info(
      'command_usage',
      `[slash] [Server: ${interaction.guild?.name || 'DM'}] [Channel: ${interaction.channel?.name || 'N/A'}] User ${interaction.user.tag} (${interaction.user.id}) used: /${interaction.commandName}`,
    );

    const { userRole, isPrivileged } = await resolveCommandAccess(interaction.user.id);
    logger.info('command', `Role resolved for ${interaction.user.id}: ${userRole}`);

    const commandName = command.data?.name || interaction.commandName;
    const deny = (message) => interaction.reply({ content: `${emojis.error} ${message}`, ephemeral: true });

    if (!(await ensureCommandEnabledInChannel({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      commandName,
      deny: () => deny(interaction.t('system.command_disabled_in_channel')),
    }))) {
      return;
    }

    if (!(await ensureCommandUnlocked({
      commandName,
      isPrivileged,
      deny: () => deny(interaction.t('system.command_locked_for_maintenance')),
    }))) {
      return;
    }

    if (command.prefix?.adminOnly && !isPrivileged) {
      await deny(interaction.t('system.no_permission'));
      return;
    }

    if (!(await ensureMemberPermissions({
      member: interaction.member,
      requiredPermissions: getRequiredMemberPermissions(command),
      deny: () => deny(interaction.t('system.missing_server_permissions')),
    }))) {
      return;
    }

    const cooldownSeconds = getCommandCooldownSeconds(command);
    if (!(await ensureCommandCooldown({
      userId: interaction.user.id,
      commandName,
      cooldownSeconds,
      isPrivileged,
      deny: async ({ remaining, expiresAtUnix }) => {
        await interaction.reply({
          content: interaction.t('system.cooldown_wait', { expiresAtUnix }),
          ephemeral: true,
        });
        setTimeout(() => interaction.deleteReply().catch(() => { }), remaining * 1000);
      },
    }))) {
      return;
    }

    if (!(await ensureUserConsent(interaction, interaction.user))) {
      return;
    }

    logger.info('command', `Executing handler for /${interaction.commandName}`);
    await command.execute(interaction);

    setCommandCooldown(interaction.user.id, commandName, cooldownSeconds);
    await CommandNoticeService.appendActiveNotice(interaction);
  } catch (error) {
    logger.error(
      'command',
      `Error executing command ${interaction.commandName} | replied=${interaction.replied} | deferred=${interaction.deferred} | localeBound=${typeof interaction.t === 'function'}`,
      {
        userId: interaction.user?.id,
        userTag: interaction.user?.tag,
        guildId: interaction.guildId,
        guildName: interaction.guild?.name,
        channelId: interaction.channelId,
        channelName: interaction.channel?.name,
        commandName: interaction.commandName,
      },
      error,
    );

    const errPayload = { content: `${emojis.error} ${interaction.t('system.command_execution_failed')}`, ephemeral: true };
    const respond = interaction.replied || interaction.deferred
      ? interaction.followUp(errPayload)
      : interaction.reply(errPayload);
    await respond.catch(() => { });
  }
};

module.exports = {
  loadCommands,
  handleCommand,
  getCommandsJson,
};
