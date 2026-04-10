const logger = require('./logger.js');

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
    logger.warn('PERMISSION', `Bot thiếu quyền ${permission} trong guild ${interaction.guild?.id || 'DM'}`);
  } catch (error) {
    logger.error('PERMISSION', 'Lỗi khi xử lý permission error:', error);
  }
}

async function sendEmbedWithFallback(interaction, embedData, username, permission = 'embedLinks', action = 'reply') {
  try {
    await sendToInteraction(interaction, embedData, action);
    return true;
  } catch (error) {
    if (error.code === 50013 || error.message?.includes('permission')) {
      await handlePermissionError(interaction, permission, username, action);
      return false;
    }
    throw error;
  }
}

function hasPermission(interaction, permission) {
  if (!interaction.guild) return true;
  return interaction.guild.members.me?.permissions.has(permission) ?? false;
}

module.exports = { handlePermissionError, sendEmbedWithFallback, hasPermission };