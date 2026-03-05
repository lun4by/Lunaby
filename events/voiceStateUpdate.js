const { Events } = require('discord.js');
const GuildProfileDB = require('../services/database/guildprofiledb.js');
const AICore = require('../services/AICore.js');
const prompts = require('../config/prompts.js');
const logger = require('../utils/logger.js');

const cooldowns = new Map();
const COOLDOWN_MS = 5000;

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

            let eventType = null;
            let voiceChannel = null;

            if (!oldChannel && newChannel) {
                eventType = 'join';
                voiceChannel = newChannel;
            } else if (oldChannel && !newChannel) {
                eventType = 'leave';
                voiceChannel = oldChannel;
            } else if (oldChannel && newChannel) {
                eventType = 'join';
                voiceChannel = newChannel;
            }

            if (!eventType) return;

            const settings = await GuildProfileDB.getGuildProfile(guild.id);
            if (!settings?.voiceToggle?.isEnabled) return;

            const cooldownKey = `${guild.id}-${member.id}`;
            const now = Date.now();
            if (cooldowns.has(cooldownKey) && now - cooldowns.get(cooldownKey) < COOLDOWN_MS) return;
            cooldowns.set(cooldownKey, now);

            const memberName = member.displayName || member.user.username;
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

            logger.debug('VOICE_TOGGLE', `${eventType === 'join' ? 'Greeted' : 'Farewell'} ${memberName} in ${guild.name}/${channelName}`);
        } catch (error) {
            logger.error('VOICE_TOGGLE', 'Error handling voice state update:', error);
        }
    });

    setInterval(() => {
        const now = Date.now();
        for (const [key, timestamp] of cooldowns) {
            if (now - timestamp > COOLDOWN_MS * 2) cooldowns.delete(key);
        }
    }, 5 * 60 * 1000);

    logger.info('EVENTS', 'Đã đăng ký event: VoiceStateUpdate');
}

module.exports = { setupVoiceStateEvent };