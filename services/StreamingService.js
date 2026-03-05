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

    let currentMessage = null;
    let lastUpdate = Date.now();
    let lastSentLength = 0;
    let pendingSend = null;
    let messageChunks = [];

    const typingInterval = setInterval(() => channel.sendTyping().catch(() => { }), 5000);

    const getTargetMessage = async (isFirstMessage) => {
        if (isFirstMessage && replyToMessage) {
            return replyToMessage.reply('...');
        }
        return channel.send('...');
    };

    try {
        const fullContent = await stream.process({
            onContent: async (chunk, accumulated) => {
                if (pendingSend) return;

                // Xóa ngang markdown do model thỉnh thoảng tự sinh ra
                const cleanAccumulated = accumulated.replace(/---+/g, '');

                const now = Date.now();
                const delta = cleanAccumulated.length - lastSentLength;
                const shouldUpdate = !currentMessage ||
                    (now - lastUpdate >= STREAM_UPDATE_INTERVAL_MS && delta >= STREAM_MIN_CHUNK_SIZE);

                if (shouldUpdate) {
                    pendingSend = (async () => {
                        try {
                            const chunks = splitByLength(cleanAccumulated, DISCORD_MESSAGE_MAX_LENGTH);

                            if (!currentMessage) {
                                currentMessage = await getTargetMessage(true);
                                messageChunks.push(currentMessage);
                            }
                            while (messageChunks.length < chunks.length) {
                                const newMsg = await getTargetMessage(false);
                                messageChunks.push(newMsg);
                            }

                            const currentChunkIndex = chunks.length - 1;
                            const activeMessage = messageChunks[currentChunkIndex];

                            if (activeMessage) {
                                await activeMessage.edit(chunks[currentChunkIndex]);
                            }

                            lastUpdate = Date.now();
                            lastSentLength = cleanAccumulated.length;
                        } catch (e) {
                            logger.error('STREAM', 'Error during stream update', e);
                        } finally {
                            pendingSend = null;
                        }
                    })();
                }
            }
        });

        if (pendingSend) await pendingSend;

        const finalChunks = splitByLength(fullContent, DISCORD_MESSAGE_MAX_LENGTH);

        while (messageChunks.length < finalChunks.length) {
            const newMsg = await getTargetMessage(messageChunks.length === 0);
            messageChunks.push(newMsg);
        }

        const updatePromises = finalChunks.map((content, idx) => {
            const msg = messageChunks[idx];
            if (msg && msg.content !== content) {
                return msg.edit(content).catch(() => { });
            }
            return Promise.resolve();
        });

        await Promise.allSettled(updatePromises);

        return fullContent;
    } finally {
        clearInterval(typingInterval);
    }
}

module.exports = { sendStreamingMessage, splitByLength };