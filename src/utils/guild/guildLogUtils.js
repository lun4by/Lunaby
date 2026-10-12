const guildNamesByClient = new WeakMap();

function rememberGuildName(guild) {
  if (!guild.client || typeof guild.name !== 'string' || !guild.name.trim()) return;

  let names = guildNamesByClient.get(guild.client);
  if (!names) {
    names = new Map();
    guildNamesByClient.set(guild.client, names);
  }
  names.set(guild.id, guild.name);
}

function resolveGuildLogName(guild) {
  rememberGuildName(guild);
  return guildNamesByClient.get(guild.client)?.get(guild.id) || 'Không rõ tên guild';
}

function forgetGuildName(guild) {
  guildNamesByClient.get(guild.client)?.delete(guild.id);
}

function shouldLogGuildMembership(guild) {
  return guild.client?.isReady?.() === true;
}

module.exports = {
  rememberGuildName,
  resolveGuildLogName,
  forgetGuildName,
  shouldLogGuildMembership,
};
