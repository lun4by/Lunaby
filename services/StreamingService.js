const logger = require('../utils/logger.js');
const AICore = require('./AICore');
const { 
    STREAM_UPDATE_INTERVAL_MS,
    STREAM_MIN_CHUNK_SIZE,
    STREAM_BATCH_UPDATE_SIZE,
    DISCORD_MESSAGE_MAX_LENGTH
} = require('../config/constants');

async function sendStreamingMessage(channel, messages, config = {}) {
    const Validators = require('../utils/validators');
    
    const client = AICore.getClient();
    if (!client) throw new Error('SDK client not initialized');

    const validMessages = Validators.cleanMessages(messages);
    if (!validMessages.length) throw new Error('No valid messages');

    const stream = await client.chat.createStream(validMessages, {
        model: config.model || AICore.getModelName(),
        max_tokens: config.max_tokens || 2048,
        ...config
    });

    let sentMessage = null;
    let lastUpdate = Date.now();
    let lastSentLength = 0;

    const typingInterval = setInterval(() => channel.sendTyping().catch(() => {}), 5000);

    try {
        const fullContent = await stream.process({
            onContent: async (chunk, accumulated) => {
                const now = Date.now();
                const delta = accumulated.length - lastSentLength;
                const shouldUpdate = !sentMessage || 
                    delta >= STREAM_BATCH_UPDATE_SIZE || 
                    (now - lastUpdate >= STREAM_UPDATE_INTERVAL_MS && delta >= STREAM_MIN_CHUNK_SIZE);
                
                if (shouldUpdate) {
                    try {
                        const text = accumulated.substring(0, DISCORD_MESSAGE_MAX_LENGTH);
                        if (!sentMessage) {
                            sentMessage = await channel.send(text);
                        } else if (accumulated.length <= DISCORD_MESSAGE_MAX_LENGTH) {
                            await sentMessage.edit(text);
                        }
                        lastUpdate = now;
                        lastSentLength = accumulated.length;
                    } catch (e) {
                        if (e.code === 10008) sentMessage = null;
                    }
                }
            }
        });

        clearInterval(typingInterval);
        await sendFinalMessage(channel, sentMessage, fullContent);
        return fullContent;
    } catch (error) {
        clearInterval(typingInterval);
        throw error;
    }
}

async function sendFinalMessage(channel, sentMessage, content) {
    if (content.length <= DISCORD_MESSAGE_MAX_LENGTH) {
        if (sentMessage && sentMessage.content !== content) {
            await sentMessage.edit(content);
        } else if (!sentMessage) {
            await channel.send(content);
        }
        return;
    }

    const first = content.substring(0, DISCORD_MESSAGE_MAX_LENGTH);
    if (sentMessage) await sentMessage.edit(first);
    else await channel.send(first);

    const chunks = splitByLength(content.substring(DISCORD_MESSAGE_MAX_LENGTH), DISCORD_MESSAGE_MAX_LENGTH);
    for (const chunk of chunks) {
        await channel.send(chunk);
        await new Promise(r => setTimeout(r, 100));
    }
}

function splitByLength(text, maxLength) {
    const chunks = [];
    let start = 0;
    while (start < text.length) {
        let end = Math.min(start + maxLength, text.length);
        if (end < text.length) {
            while (end > start && text[end] !== ' ' && text[end] !== '\n') end--;
            if (end === start) end = start + maxLength;
        }
        chunks.push(text.substring(start, end));
        start = end + (text[end] === ' ' || text[end] === '\n' ? 1 : 0);
    }
    return chunks;
}

module.exports = { sendStreamingMessage, splitByLength };
