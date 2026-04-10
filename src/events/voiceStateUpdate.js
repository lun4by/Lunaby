const { Events, ChannelType, PermissionFlagsBits } = require('discord.js');
const MariaModDB = require('../services/database/MariaModDB.js');
const PrefixDB = require('../services/database/PrefixDB.js');
const AICore = require('../services/ai/AICore.js');
const prompts = require('../config/prompts.js');
const emojis = require('../config/emojis.js');
const logger = require('../utils/logger.js');

const creatorChannels = new Map();
const activeVoiceChannels = new Map();
const userVoiceCooldowns = new Map();
const pendingVoiceCreations = new Map();
const voiceToggleCache = new Map();
const voiceGreetingDebounce = new Map();

const LVOICE_COOLDOWN_MS = 3000;
const VOICE_TOGGLE_CACHE_TTL_MS = 15000;
const VOICE_GREETING_DEBOUNCE_MS = 2500;

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function canSendVoiceGreeting(memberId, channelId, eventType) {
    const key = `${memberId}:${channelId}:${eventType}`;
    const now = Date.now();
    const lastSent = voiceGreetingDebounce.get(key) || 0;

    if (now - lastSent < VOICE_GREETING_DEBOUNCE_MS) {
        return false;
    }

    voiceGreetingDebounce.set(key, now);
    return true;
}

async function isVoiceWelcomeEnabled(guildId) {
    const cached = voiceToggleCache.get(guildId);
    const now = Date.now();

    if (cached && now - cached.ts < VOICE_TOGGLE_CACHE_TTL_MS) {
        return cached.enabled;
    }

    const settings = await MariaModDB.getGuildSettings(guildId);
    const enabled = Boolean(settings?.voiceToggle?.isEnabled);
    voiceToggleCache.set(guildId, { enabled, ts: now });
    return enabled;
}

/**
 * Load cache từ DB khi bot khởi động
 */
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

/**
 * Cleanup kênh zombie (kênh đã bị xóa nhưng vẫn còn trong DB)
 */
async function cleanupZombieChannels(client) {
    try {
        let cleaned = 0;
        for (const [channelId, data] of activeVoiceChannels) {
            try {
                const guild = client.guilds.cache.get(data.guildId);
                if (!guild) {
                    activeVoiceChannels.delete(channelId);
                    await MariaModDB.removeActiveVoice(channelId);
                    cleaned++;
                    continue;
                }

                const channel = guild.channels.cache.get(channelId);
                if (!channel) {
                    activeVoiceChannels.delete(channelId);
                    await MariaModDB.removeActiveVoice(channelId);
                    cleaned++;
                    continue;
                }

                if (channel.members.size === 0) {
                    await channel.delete('LunabyVC: Cleanup kênh trống sau restart');
                    activeVoiceChannels.delete(channelId);
                    await MariaModDB.removeActiveVoice(channelId);
                    cleaned++;
                }
            } catch (e) {
                activeVoiceChannels.delete(channelId);
                await MariaModDB.removeActiveVoice(channelId);
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
    if (!voiceChannel || !voiceChannel.isTextBased?.()) {
        return;
    }

    const me = voiceChannel.guild.members.me;
    if (me && !voiceChannel.permissionsFor(me)?.has('SendMessages')) {
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
            const footer = `\n-# Sử dụng: \`/voicewelcome toggle\` để bật/tắt voice welcome`;
            await voiceChannel.send(result.content + footer);
        }

        logger.debug('voice_toggle', `${eventType === 'join' ? 'Greeted' : 'Farewell'} ${memberName} in ${voiceChannel.guild.name}/${channelName}`);
    } catch (error) {
        logger.error('voice_toggle', `Failed to generate voice greeting (${eventType}) for ${member.user.tag}:`, error.message);
    }
}

async function createTempVoiceChannel(newState, member, creatorConfig) {
    if (member.voice?.channelId !== newState.channelId) {
        return;
    }

    const guild = newState.guild;

    // Tạo tên kênh từ template
    const channelName = creatorConfig.defaultName.replace('{user}', member.displayName || member.user.username);
    const creatorChannel = newState.channel;
    const parentId = creatorChannel?.parentId || creatorConfig.categoryId;

    // Tạo kênh voice tạm
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

    // Chuyển user vào kênh tạm
    await member.voice.setChannel(tempChannel);

    // Lưu vào cache + DB
    activeVoiceChannels.set(tempChannel.id, {
        guildId: guild.id,
        ownerId: member.id,
    });
    await MariaModDB.addActiveVoice(tempChannel.id, guild.id, member.id);

    logger.info('lvoice', `Created temp channel "${channelName}" for ${member.user.tag} in ${guild.name}`);
}

async function handleVoiceMasterJoin(newState, member) {
    const creatorConfig = creatorChannels.get(newState.channelId);
    if (!creatorConfig) return;

    if (pendingVoiceCreations.has(member.id)) {
        return;
    }

    const now = Date.now();
    const lastCreated = userVoiceCooldowns.get(member.id) || 0;
    const cooldownLeftMs = Math.max(0, LVOICE_COOLDOWN_MS - (now - lastCreated));

    const pendingCreateTask = (async () => {
        if (cooldownLeftMs > 0) {
            await member.send({
                content: `${emojis.lvoice.cooldown} Bạn thao tác quá nhanh! Vui lòng giữ nguyên ở kênh Voice trong **${(cooldownLeftMs / 1000).toFixed(1)}s** nữa, hệ thống sẽ tự động tạo phòng cho bạn.`
            }).catch(() => {});

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
    if (!activeVoiceChannels.has(channelId)) return;

    const channel = oldState.channel;
    if (!channel) return;

    if (channel.members.size > 0) return;

    try {
        await channel.delete('LunabyVC: Kênh tạm trống');
        activeVoiceChannels.delete(channelId);
        await MariaModDB.removeActiveVoice(channelId);

        logger.info('lvoice', `Deleted empty temp channel "${channel.name}" in ${oldState.guild.name}`);
    } catch (error) {
        logger.error('lvoice', `Error deleting temp voice channel:`, error);
        // Fallback: xóa khỏi cache nếu kênh đã không còn
        activeVoiceChannels.delete(channelId);
        await MariaModDB.removeActiveVoice(channelId);
    }
}

function setupVoiceStateEvent(client) {
    client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
        try {
            const member = newState.member || oldState.member;
            if (!member || member.user.bot) return;

            const guild = newState.guild || oldState.guild;
            if (!guild) return;

            const oldChannel = oldState.channel;
            let newChannel = newState.channel;

            if (oldChannel?.id === newChannel?.id) return;

            if (newChannel && creatorChannels.has(newChannel.id)) {
                await handleVoiceMasterJoin(newState, member);
                // Sau khi user vào creator channel, LVoice sẽ chuyển họ sang kênh tạm.
                // Cần đọc lại channel hiện tại để voicewelcome gửi đúng vào kênh vừa tạo.
                newChannel = member.voice?.channel || newChannel;
            }

            if (oldChannel && activeVoiceChannels.has(oldChannel.id)) {
                await handleVoiceMasterLeave(oldState);
            }

            const voiceWelcomeEnabled = await isVoiceWelcomeEnabled(guild.id);
            if (voiceWelcomeEnabled) {
                const isCreator = (ch) => ch && creatorChannels.has(ch.id);

                if (oldChannel && newChannel && !isCreator(oldChannel) && !isCreator(newChannel)) {
                    await sendVoiceGreeting('leave', member, oldChannel);
                    await sendVoiceGreeting('join', member, newChannel);
                } else if (!oldChannel && newChannel && !isCreator(newChannel)) {
                    await sendVoiceGreeting('join', member, newChannel);
                } else if (oldChannel && !newChannel && !isCreator(oldChannel)) {
                    await sendVoiceGreeting('leave', member, oldChannel);
                }
            }
        } catch (error) {
            logger.error('voice_toggle', 'Error handling voice state update:', error);
        }
    });

    logger.info('events', 'Registered event: VoiceStateUpdate');
}

module.exports = {
    setupVoiceStateEvent,
    loadLVoiceCache,
    cleanupZombieChannels,
    creatorChannels,
    activeVoiceChannels,
};