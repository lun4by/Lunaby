const { ChannelType, PermissionFlagsBits } = require('discord.js');
const MariaModDB = require('../services/database/MariaModDB.js');
const AICore = require('../services/ai/AICore.js');
const i18nManager = require('../services/i18n/i18nManager');
const { getGuildVoiceSettings } = require('../utils/guild/guildLocale.js');
const { hasChannelPermission } = require('../utils/discord/permissionUtils.js');
const prompts = require('../config/prompts.js');
const emojis = require('../config/emojis.js');
const logger = require('../utils/core/logger.js');

const creatorChannels = new Map();
const activeVoiceChannels = new Map();
const userVoiceCooldowns = new Map();
const pendingVoiceCreations = new Map();
const voiceGreetingDebounce = new Map();

const lvoiceCooldownMs = 3000;
const voiceGreetingDebounceMs = 2500;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canSendVoiceGreeting(memberId, channelId, eventType) {
  const key = `${memberId}:${channelId}:${eventType}`;
  const now = Date.now();
  const lastSent = voiceGreetingDebounce.get(key) || 0;

  if (now - lastSent < voiceGreetingDebounceMs) {
    return false;
  }

  voiceGreetingDebounce.set(key, now);
  return true;
}

function isCreatorVoiceChannel(channel) {
  return Boolean(channel && creatorChannels.has(channel.id));
}

function isTrackedTempVoiceChannel(channel) {
  return Boolean(channel && activeVoiceChannels.has(channel.id));
}

function canSendGreetingToChannel(guild, channel, wasTrackedTemp) {
  return Boolean(channel)
    && !isCreatorVoiceChannel(channel)
    && !wasTrackedTemp
    && guild.channels.cache.has(channel.id);
}

async function removeTrackedVoiceChannel(channelId) {
  activeVoiceChannels.delete(channelId);
  await MariaModDB.removeActiveVoice(channelId);
}

async function loadLVoiceCache() {
  try {
    const configs = await MariaModDB.getAllLVoiceConfigs();
    for (const config of configs) {
      creatorChannels.set(config.creatorChannelId, {
        guildId: config.guildId,
        categoryId: config.categoryId,
        defaultName: config.defaultName,
        defaultLimit: config.defaultLimit,
        defaultBitrate: config.defaultBitrate,
      });
    }

    const actives = await MariaModDB.getAllActiveVoices();
    for (const active of actives) {
      activeVoiceChannels.set(active.channelId, {
        guildId: active.guildId,
        ownerId: active.ownerId,
      });
    }

    logger.info('lvoice', `Loaded ${creatorChannels.size} creator configs, ${activeVoiceChannels.size} active channels`);
  } catch (error) {
    logger.error('lvoice', 'Error loading VoiceMaster cache:', error);
  }
}

async function cleanupZombieChannels(client) {
  try {
    let cleaned = 0;

    for (const [channelId, data] of activeVoiceChannels) {
      try {
        const guild = client.guilds.cache.get(data.guildId);
        if (!guild) {
          await removeTrackedVoiceChannel(channelId);
          cleaned++;
          continue;
        }

        const channel = guild.channels.cache.get(channelId);
        if (!channel) {
          await removeTrackedVoiceChannel(channelId);
          cleaned++;
          continue;
        }

        if (channel.members.size === 0) {
          await channel.delete('LunabyVC: Cleanup kênh trống sau restart');
          await removeTrackedVoiceChannel(channelId);
          cleaned++;
        }
      } catch (_) {
        await removeTrackedVoiceChannel(channelId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info('lvoice', `Cleaned up ${cleaned} zombie channels`);
    }
  } catch (error) {
    logger.error('lvoice', 'Error cleaning up zombie channels:', error);
  }
}

async function sendVoiceGreeting(eventType, member, voiceChannel) {
  if (!voiceChannel) {
    return;
  }

  const liveChannel = voiceChannel.guild.channels.cache.get(voiceChannel.id);
  if (!liveChannel || !liveChannel.isTextBased?.()) {
    return;
  }

  const me = liveChannel.guild.members.me;
  if (me && !hasChannelPermission(liveChannel, me, 'SendMessages')) {
    return;
  }

  if (!canSendVoiceGreeting(member.id, voiceChannel.id, eventType)) {
    return;
  }

  const memberName = member.displayName || member.user.username;
  const channelName = voiceChannel.name;
  const promptTemplate = eventType === 'join'
    ? prompts.voiceGreeting.join
    : prompts.voiceGreeting.leave;

  const prompt = promptTemplate
    .replace('${memberName}', memberName)
    .replace('${channelName}', channelName);

  const messages = [
    { role: 'system', content: prompts.system.main.replace(/\$\{language\}/g, 'Vietnamese') },
    { role: 'user', content: prompt },
  ];

  try {
    const result = await AICore.processChatCompletion(messages, {
      clientType: 'discord',
      max_tokens: 256,
      stream: false,
    });

    if (result?.content) {
      const footer = '\n-# Sử dụng: `/voicewelcome toggle` để bật/tắt voice welcome';
      await liveChannel.send(result.content + footer);
    }

    logger.debug('voice_toggle', `${eventType === 'join' ? 'Greeted' : 'Farewell'} ${memberName} in ${liveChannel.guild.name}/${channelName}`);
  } catch (error) {
    logger.error('voice_toggle', `Failed to generate voice greeting (${eventType}) for ${member.user.tag}:`, error.message);
  }
}

async function createTempVoiceChannel(newState, member, creatorConfig) {
  if (member.voice?.channelId !== newState.channelId) {
    return;
  }

  const guild = newState.guild;
  const channelName = creatorConfig.defaultName.replace('{user}', member.displayName || member.user.username);
  const creatorChannel = newState.channel;
  const parentId = creatorChannel?.parentId || creatorConfig.categoryId;

  const tempChannel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildVoice,
    parent: parentId,
    userLimit: creatorConfig.defaultLimit,
    bitrate: Math.min(creatorConfig.defaultBitrate, guild.maximumBitrate),
    permissionOverwrites: [
      {
        id: member.id,
        allow: [
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.MoveMembers,
          PermissionFlagsBits.MuteMembers,
          PermissionFlagsBits.DeafenMembers,
        ],
      },
    ],
  });

  await member.voice.setChannel(tempChannel);

  activeVoiceChannels.set(tempChannel.id, {
    guildId: guild.id,
    ownerId: member.id,
  });
  await MariaModDB.addActiveVoice(tempChannel.id, guild.id, member.id);

  logger.info('lvoice', `Created temp channel "${channelName}" for ${member.user.tag} in ${guild.name}`);
}

async function handleVoiceMasterJoin(newState, member, locale = 'vi') {
  const creatorConfig = creatorChannels.get(newState.channelId);
  if (!creatorConfig || pendingVoiceCreations.has(member.id)) {
    return;
  }

  const now = Date.now();
  const lastCreated = userVoiceCooldowns.get(member.id) || 0;
  const cooldownLeftMs = Math.max(0, lvoiceCooldownMs - (now - lastCreated));

  const pendingCreateTask = (async () => {
    if (cooldownLeftMs > 0) {
      const cooldownText = i18nManager.t('commands.lvoice.cooldown_wait', locale, {
        cooldown: (cooldownLeftMs / 1000).toFixed(1),
      });

      await member.send({
        content: `${emojis.lvoice.cooldown} ${cooldownText}`,
      }).catch(() => { });

      await wait(cooldownLeftMs);
      if (member.voice?.channelId !== newState.channelId) {
        return;
      }
    }

    userVoiceCooldowns.set(member.id, Date.now());
    await createTempVoiceChannel(newState, member, creatorConfig);
  })();

  pendingVoiceCreations.set(member.id, pendingCreateTask);
  try {
    await pendingCreateTask;
  } catch (error) {
    logger.error('lvoice', 'Error creating temp voice channel:', error);
  } finally {
    pendingVoiceCreations.delete(member.id);
  }
}

async function handleVoiceMasterLeave(oldState) {
  const channelId = oldState.channelId;
  if (!activeVoiceChannels.has(channelId)) {
    return;
  }

  const channel = oldState.channel;
  if (!channel || channel.members.size > 0) {
    return;
  }

  try {
    await channel.delete('LunabyVC: Kênh tạm trống');
    await removeTrackedVoiceChannel(channelId);
    logger.info('lvoice', `Deleted empty temp channel "${channel.name}" in ${oldState.guild.name}`);
  } catch (error) {
    logger.error('lvoice', 'Error deleting temp voice channel:', error);
    await removeTrackedVoiceChannel(channelId);
  }
}

async function processVoiceStateUpdate(oldState, newState) {
  const member = newState.member || oldState.member;
  if (!member || member.user.bot) {
    return;
  }

  const guild = newState.guild || oldState.guild;
  if (!guild) {
    return;
  }

  const { enabled: voiceWelcomeEnabled, locale } = await getGuildVoiceSettings(guild.id);

  const oldChannel = oldState.channel;
  let newChannel = newState.channel;
  const oldChannelWasTemp = isTrackedTempVoiceChannel(oldChannel);
  const newChannelWasTemp = isTrackedTempVoiceChannel(newChannel);

  if (oldChannel?.id === newChannel?.id) {
    return;
  }

  if (newChannel && creatorChannels.has(newChannel.id)) {
    await handleVoiceMasterJoin(newState, member, locale);
    newChannel = member.voice?.channel || newChannel;
  }

  if (oldChannel && activeVoiceChannels.has(oldChannel.id)) {
    await handleVoiceMasterLeave(oldState);
  }

  if (!voiceWelcomeEnabled) {
    return;
  }

  const shouldGreetOld = canSendGreetingToChannel(guild, oldChannel, oldChannelWasTemp);
  const shouldGreetNew = canSendGreetingToChannel(guild, newChannel, newChannelWasTemp);

  if (shouldGreetOld && shouldGreetNew) {
    await sendVoiceGreeting('leave', member, oldChannel);
    await sendVoiceGreeting('join', member, newChannel);
    return;
  }

  if (!oldChannel && shouldGreetNew) {
    await sendVoiceGreeting('join', member, newChannel);
    return;
  }

  if (shouldGreetOld && !newChannel) {
    await sendVoiceGreeting('leave', member, oldChannel);
  }
}

module.exports = {
  activeVoiceChannels,
  cleanupZombieChannels,
  creatorChannels,
  loadLVoiceCache,
  processVoiceStateUpdate,
};

