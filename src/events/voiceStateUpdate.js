const { Events, ChannelType, PermissionFlagsBits } = require('discord.js');
const MariaModDB = require('../services/database/MariaModDB.js');
const PrefixDB = require('../services/database/PrefixDB.js');
const AICore = require('../services/ai/AICore.js');
const prompts = require('../config/prompts.js');
const logger = require('../utils/logger.js');

const creatorChannels = new Map();
const activeVoiceChannels = new Map();

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

        logger.info('LVOICE', `Loaded ${creatorChannels.size} creator configs, ${activeVoiceChannels.size} active channels`);
    } catch (error) {
        logger.error('LVOICE', 'Error loading VoiceMaster cache:', error);
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
            logger.info('LVOICE', `Cleaned up ${cleaned} zombie channels`);
        }
    } catch (error) {
        logger.error('LVOICE', 'Error cleaning up zombie channels:', error);
    }
}

async function sendVoiceGreeting(eventType, memberName, voiceChannel) {
    if (!voiceChannel || !voiceChannel.isTextBased?.()) {
        return;
    }

    const channelName = voiceChannel.name;

    const promptTemplate = eventType === 'join'
        ? prompts.voiceGreeting.join
        : prompts.voiceGreeting.leave;

    const prompt = promptTemplate
        .replace('${memberName}', memberName)
        .replace('${channelName}', channelName);

    const messages = [
        { role: 'system', content: prompts.system.main },
        { role: 'user', content: prompt },
    ];

    const result = await AICore.processChatCompletion(messages, { max_tokens: 256, stream: false });

    if (result?.content) {
        const prefix = await PrefixDB.resolvePrefix(null, voiceChannel.guild.id);
        const footer = `\n-# Sử dụng: \`${prefix}voicewelcome toggle\` hoặc \`/voicewelcome toggle\` để bật/tắt voice welcome`;
        await voiceChannel.send(result.content + footer);
    }

    logger.debug('VOICE_TOGGLE', `${eventType === 'join' ? 'Greeted' : 'Farewell'} ${memberName} in ${voiceChannel.guild.name}/${channelName}`);
}

async function handleVoiceMasterJoin(newState, member) {
    const creatorConfig = creatorChannels.get(newState.channelId);
    if (!creatorConfig) return;

    const guild = newState.guild;

    try {
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

        // Move user vào kênh tạm
        await member.voice.setChannel(tempChannel);

        // Lưu vào cache + DB
        activeVoiceChannels.set(tempChannel.id, {
            guildId: guild.id,
            ownerId: member.id,
        });
        await MariaModDB.addActiveVoice(tempChannel.id, guild.id, member.id);

        logger.info('LVOICE', `Created temp channel "${channelName}" for ${member.user.tag} in ${guild.name}`);
    } catch (error) {
        logger.error('LVOICE', `Error creating temp voice channel:`, error);
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

        logger.info('LVOICE', `Deleted empty temp channel "${channel.name}" in ${oldState.guild.name}`);
    } catch (error) {
        logger.error('LVOICE', `Error deleting temp voice channel:`, error);
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
                // Sau khi user vào creator channel, LVoice sẽ move họ sang kênh tạm.
                // Cần đọc lại channel hiện tại để voicewelcome gửi đúng vào kênh vừa tạo.
                newChannel = member.voice?.channel || newChannel;
            }

            if (oldChannel && activeVoiceChannels.has(oldChannel.id)) {
                await handleVoiceMasterLeave(oldState);
            }

            const settings = await MariaModDB.getGuildSettings(guild.id);
            if (settings?.voiceToggle?.isEnabled) {
                const memberName = member.displayName || member.user.username;
                const isCreator = (ch) => ch && creatorChannels.has(ch.id);

                if (oldChannel && newChannel && !isCreator(oldChannel) && !isCreator(newChannel)) {
                    await sendVoiceGreeting('leave', memberName, oldChannel);
                    await sendVoiceGreeting('join', memberName, newChannel);
                } else if (!oldChannel && newChannel && !isCreator(newChannel)) {
                    await sendVoiceGreeting('join', memberName, newChannel);
                } else if (oldChannel && !newChannel && !isCreator(oldChannel)) {
                    await sendVoiceGreeting('leave', memberName, oldChannel);
                }
            }
        } catch (error) {
            logger.error('VOICE_TOGGLE', 'Error handling voice state update:', error);
        }
    });

    logger.info('EVENTS', 'Đã đăng ký event: VoiceStateUpdate');
}

module.exports = {
    setupVoiceStateEvent,
    loadLVoiceCache,
    cleanupZombieChannels,
    creatorChannels,
    activeVoiceChannels,
};
