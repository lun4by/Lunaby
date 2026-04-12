const consentService = require('../../services/user/consentService');
const MariaModDB = require('../../services/database/MariaModDB');
const RoleService = require('../../services/user/RoleService');
const CooldownService = require('../../services/user/CooldownService');
const i18nManager = require('../../services/i18n/i18nManager');
const { getGuildLocale } = require('../../utils/guild/guildLocale.js');
const {
  handlePermissionError,
  hasMemberPermission,
  isMissingPermissionError,
} = require('../../utils/discord/permissionUtils');

const DEFAULT_LOCALE = 'vi';

function bindTranslator(target, locale) {
  target.t = (key, options) => i18nManager.t(key, locale, options);
  return target.t;
}

async function resolveCommandLocale(target, guildId, fallbackLocale = DEFAULT_LOCALE) {
  const locale = guildId ? await getGuildLocale(guildId, fallbackLocale) : fallbackLocale;
  bindTranslator(target, locale);
  return locale;
}

async function resolveCommandAccess(userId) {
  const userRole = await RoleService.getUserRole(userId);
  return {
    userRole,
    isPrivileged: userRole === 'owner' || userRole === 'admin',
  };
}

async function ensureUserConsent(target, user) {
  const hasConsented = await consentService.hasUserConsented(user.id);
  if (hasConsented) {
    return true;
  }

  try {
    const consentData = consentService.createConsentEmbed(user);
    await target.reply(consentData);
  } catch (error) {
    if (isMissingPermissionError(error)) {
      await handlePermissionError(target, 'embedLinks', user.username, 'reply');
      return false;
    }

    throw error;
  }

  return false;
}

async function ensureCommandEnabledInChannel({
  guildId,
  channelId,
  commandName,
  deny,
}) {
  if (!guildId) {
    return true;
  }

  const isDisabled = await MariaModDB.isCommandDisabled(guildId, channelId, commandName);
  if (!isDisabled) {
    return true;
  }

  await deny();
  return false;
}

async function ensureCommandUnlocked({
  commandName,
  isPrivileged,
  deny,
}) {
  const isLocked = await MariaModDB.isCommandLocked(commandName);
  if (!isLocked || isPrivileged) {
    return true;
  }

  await deny();
  return false;
}

function getRequiredMemberPermissions(command) {
  return command?.data?.default_member_permissions
    ? BigInt(command.data.default_member_permissions)
    : null;
}

async function ensureMemberPermissions({
  member,
  requiredPermissions,
  deny,
}) {
  if (!requiredPermissions || hasMemberPermission(member, requiredPermissions)) {
    return true;
  }

  await deny();
  return false;
}

async function ensureCommandCooldown({
  userId,
  commandName,
  cooldownSeconds,
  isPrivileged,
  deny,
}) {
  if (isPrivileged) {
    return true;
  }

  const { onCooldown, remaining, expiresAtUnix } = CooldownService.check(
    userId,
    commandName,
    cooldownSeconds,
  );

  if (!onCooldown) {
    return true;
  }

  await deny({ remaining, expiresAtUnix });
  return false;
}

function setCommandCooldown(userId, commandName, cooldownSeconds) {
  CooldownService.set(userId, commandName, cooldownSeconds);
}

function getCommandCooldownSeconds(command) {
  return command?.cooldown ?? CooldownService.DEFAULT_COOLDOWN;
}

module.exports = {
  bindTranslator,
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
};
