const AICore = require('./AICore');
const Validators = require('../utils/validators');
const {
    STREAM_UPDATE_INTERVAL_MS,
    STREAM_MIN_CHUNK_SIZE,
    STREAM_BATCH_UPDATE_SIZE,
    DISCORD_MESSAGE_MAX_LENGTH
} = require('../config/constants');

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

async function sendStreamingMessage(channel, messages, config = {}, replyToMessage = null) {
    const client = AICore.getClient();
    if (!client) throw new Error('SDK client not initialized');

    const validMessages = Validators.cleanMessages(messages);
    if (!validMessages.length) throw new Error('No valid messages');

    const stream = await client.chat.createStream(validMessages, {
        max_tokens: config.max_tokens || 2048,
        ...config
    });

    let sentMessage = null;
    let lastUpdate = Date.now();
    let lastSentLength = 0;
    let pendingSend = null;

    const typingInterval = setInterval(() => channel.sendTyping().catch(() => { }), 5000);

    try {
        const fullContent = await stream.process({
            onContent: async (chunk, accumulated) => {
                if (pendingSend) return;

                const now = Date.now();
                const delta = accumulated.length - lastSentLength;
                const shouldUpdate = !sentMessage ||
                    delta >= STREAM_BATCH_UPDATE_SIZE ||
                    (now - lastUpdate >= STREAM_UPDATE_INTERVAL_MS && delta >= STREAM_MIN_CHUNK_SIZE);

                if (shouldUpdate) {
                    const text = accumulated.substring(0, DISCORD_MESSAGE_MAX_LENGTH);

                    pendingSend = (async () => {
                        try {
                            if (!sentMessage) {
                                sentMessage = replyToMessage
                                    ? await replyToMessage.reply(text)
                                    : await channel.send(text);
                            } else if (accumulated.length <= DISCORD_MESSAGE_MAX_LENGTH) {
                                await sentMessage.edit(text);
                            }
                            lastUpdate = Date.now();
                            lastSentLength = accumulated.length;
                        } catch (e) {
                            if (e.code === 10008) sentMessage = null;
                        } finally {
                            pendingSend = null;
                        }
                    })();
                }
            }
        });

        if (pendingSend) await pendingSend;

        const sendOrReply = (text) => replyToMessage ? replyToMessage.reply(text) : channel.send(text);

        if (fullContent.length <= DISCORD_MESSAGE_MAX_LENGTH) {
            if (sentMessage && sentMessage.content !== fullContent) {
                await sentMessage.edit(fullContent);
            } else if (!sentMessage) {
                sentMessage = await sendOrReply(fullContent);
            }
        } else {
            const first = fullContent.substring(0, DISCORD_MESSAGE_MAX_LENGTH);
            if (sentMessage) await sentMessage.edit(first);
            else await sendOrReply(first);

            for (const chunk of splitByLength(fullContent.substring(DISCORD_MESSAGE_MAX_LENGTH), DISCORD_MESSAGE_MAX_LENGTH)) {
                await channel.send(chunk);
                await new Promise(r => setTimeout(r, 100));
            }
        }

        return fullContent;
    } finally {
        clearInterval(typingInterval);
    }
}

module.exports = { sendStreamingMessage, splitByLength };
