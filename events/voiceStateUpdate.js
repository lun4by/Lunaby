const { Events } = require('discord.js');
const GuildProfileDB = require('../services/database/guildprofiledb.js');
const AICore = require('../services/AICore.js');
const prompts = require('../config/prompts.js');
const logger = require('../utils/logger.js');

async function sendVoiceGreeting(eventType, memberName, voiceChannel) {
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

    const result = await AICore.processChatCompletion(messages, { max_tokens: 256 });

    if (result?.content) {
        await voiceChannel.send(result.content);
    }

    logger.debug('VOICE_TOGGLE', `${eventType === 'join' ? 'Greeted' : 'Farewell'} ${memberName} in ${voiceChannel.guild.name}/${channelName}`);
}

function setupVoiceStateEvent(client) {
    client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
        try {
            const member = newState.member || oldState.member;
            if (!member || member.user.bot) return;

            const guild = newState.guild || oldState.guild;
            if (!guild) return;

            const oldChannel = oldState.channel;
            const newChannel = newState.channel;

            if (oldChannel?.id === newChannel?.id) return;

            const settings = await GuildProfileDB.getGuildProfile(guild.id);
            if (!settings?.voiceToggle?.isEnabled) return;

            const memberName = member.displayName || member.user.username;

            if (oldChannel && newChannel) {
                await sendVoiceGreeting('leave', memberName, oldChannel);
                await sendVoiceGreeting('join', memberName, newChannel);
            } else if (!oldChannel && newChannel) {
                await sendVoiceGreeting('join', memberName, newChannel);
            } else if (oldChannel && !newChannel) {
                await sendVoiceGreeting('leave', memberName, oldChannel);
            }
        } catch (error) {
            logger.error('VOICE_TOGGLE', 'Error handling voice state update:', error);
        }
    });

    logger.info('EVENTS', 'Đã đăng ký event: VoiceStateUpdate');
}

module.exports = { setupVoiceStateEvent };