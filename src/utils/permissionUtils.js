const { PermissionsBitField } = require('discord.js');
const logger = require('./logger.js');

const PERMISSION_LABELS = {
  ManageChannels: 'Manage Channels',
  ViewChannel: 'View Channel',
  SendMessages: 'Send Messages',
  EmbedLinks: 'Embed Links',
  ReadMessageHistory: 'Read Message History',
  AttachFiles: 'Attach Files',
  AddReactions: 'Add Reactions',
  UseExternalEmojis: 'Use External Emojis',
  ManageRoles: 'Manage Roles',
  MoveMembers: 'Move Members',
  Connect: 'Connect',
  Speak: 'Speak',
};

function formatPermissionName(permission) {
  if (!permission) return '';

  return PERMISSION_LABELS[permission]
    || String(permission).replace(/([a-z])([A-Z])/g, '$1 $2');
}

function formatPermissionList(permissions) {
  return (permissions || []).map(formatPermissionName).filter(Boolean).join(', ');
}

function getMissingPermissions(permissionHolder, requiredPermissions) {
  if (!requiredPermissions?.length) {
    return [];
  }

  const normalizedRequiredPermissions = new PermissionsBitField(requiredPermissions).toArray();

  if (!permissionHolder) {
    return normalizedRequiredPermissions;
  }

  if (typeof permissionHolder.missing === 'function') {
    return permissionHolder.missing(requiredPermissions, false);
  }

  const resolvedPermissions = new PermissionsBitField(permissionHolder);
  return resolvedPermissions.missing(requiredPermissions, false);
}

function hasMemberPermission(member, requiredPermissions) {
  return Boolean(member?.permissions?.has?.(requiredPermissions));
}

function hasBotPermission(guildOrInteraction, requiredPermissions) {
  const guild = guildOrInteraction?.guild || guildOrInteraction;
  return Boolean(guild?.members?.me?.permissions?.has?.(requiredPermissions));
}

function hasChannelPermission(channel, member, requiredPermissions) {
  return Boolean(channel?.permissionsFor?.(member)?.has?.(requiredPermissions));
}

function isMissingPermissionError(error) {
  if (!error) return false;

  const code = error.code || error.statusCode || error?.response?.status || error?.response?.statusCode;
  const message = String(error.message || error?.response?.data?.message || '').toLowerCase();

  return code === 50013
    || message.includes('missing permissions')
    || message.includes('missing permission')
    || message.includes('permission')
    || message.includes('quyền');
}

async function sendToInteraction(interaction, data, action = 'reply') {
  const methods = {
    reply: ['reply', 'channel.send'],
    editReply: ['editReply', 'edit'],
    followUp: ['followUp', 'channel.send'],
    update: ['update', 'editReply', 'reply', 'channel.send'],
  };

  const chain = methods[action] || methods.reply;

  for (const method of chain) {
    if (method === 'channel.send') {
      if (interaction.channel) { await interaction.channel.send(data); return; }
    } else if (interaction[method]) {
      const payload = method === 'followUp' && typeof data === 'string' ? { content: data } : data;
      await interaction[method](payload);
      return;
    }
  }
}

async function handlePermissionError(interaction, permission, username, action = 'reply') {
  try {
    const msg = `${username}, bot không có quyền \`${permission}\`! Vui lòng thêm quyền này cho bot hoặc liên hệ quản trị viên.`;
    await sendToInteraction(interaction, msg, action);
    logger.warn('permission', `Bot is missing permission ${permission} in guild ${interaction.guild?.id || 'DM'}`);
  } catch (error) {
    logger.error('permission', 'Error while processing permission error:', error);
  }
}

async function sendEmbedWithFallback(interaction, embedData, username, permission = 'embedLinks', action = 'reply') {
  try {
    await sendToInteraction(interaction, embedData, action);
    return true;
  } catch (error) {
    if (isMissingPermissionError(error)) {
      await handlePermissionError(interaction, permission, username, action);
      return false;
    }
    throw error;
  }
}

function hasPermission(interaction, permission) {
  return hasBotPermission(interaction, permission);
}

module.exports = {
  formatPermissionList,
  formatPermissionName,
  getMissingPermissions,
  handlePermissionError,
  hasBotPermission,
  hasChannelPermission,
  hasMemberPermission,
  sendEmbedWithFallback,
  hasPermission,
  isMissingPermissionError,
};