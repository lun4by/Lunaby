const axios = require('axios');
const logger = require('../utils/logger.js');

const UPDATE_INTERVAL = 800;
const MIN_CHUNK_SIZE = 30;
const DISCORD_MAX_LENGTH = 2000;

async function sendStreamingMessage(channel, messages, config = {}) {
    const apiUrl = process.env.LUNABY_BASE_URL || 'https://api.lunie.dev/v1';
    const apiKey = process.env.LUNABY_API_KEY;

    if (!apiKey) {
        throw new Error('LUNABY_API_KEY not configured');
    }

    const response = await axios.post(
        `${apiUrl}/chat/completions`,
        {
            model: config.model || 'lunaby-pro',
            messages: messages,
            max_tokens: config.max_tokens || 2048,
            stream: true,
            ...config
        },
        {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 120000,
            responseType: 'stream'
        }
    );

    let fullContent = '';
    let lastUpdate = Date.now();
    let sentMessage = null;
    let buffer = '';
    let updateCount = 0;
    let isUpdating = false;

    const typingInterval = setInterval(() => {
        channel.sendTyping().catch(() => { });
    }, 5000);

    return new Promise((resolve, reject) => {
        response.data.on('data', async (chunk) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('event:')) continue;

                if (trimmed.startsWith('data:')) {
                    const data = trimmed.slice(5).trim();
                    if (data === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(data);
                        const content = parsed.choices?.[0]?.delta?.content;

                        if (content) {
                            fullContent += content;

                            const now = Date.now();
                            const shouldUpdate =
                                (now - lastUpdate > UPDATE_INTERVAL && fullContent.length >= MIN_CHUNK_SIZE) ||
                                fullContent.length % 200 === 0;

                            if (shouldUpdate && !isUpdating) {
                                isUpdating = true;
                                try {
                                    if (!sentMessage) {
                                        sentMessage = await channel.send(fullContent.length > DISCORD_MAX_LENGTH ? fullContent.substring(0, DISCORD_MAX_LENGTH) : fullContent);
                                        updateCount++;
                                    } else if (fullContent.length <= DISCORD_MAX_LENGTH) {
                                        await sentMessage.edit(fullContent);
                                        updateCount++;
                                    }
                                    lastUpdate = now;
                                } catch (editError) {
                                    logger.warn('STREAMING', `Failed to update message: ${editError.message}`);
                                } finally {
                                    isUpdating = false;
                                }
                            }
                        }
                    } catch (e) {
                    }
                }
            }
        });

        response.data.on('end', async () => {
            clearInterval(typingInterval);

            while (isUpdating) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            logger.info('STREAMING', `Stream completed. Total length: ${fullContent.length}, Updates: ${updateCount}`);

            try {
                if (fullContent.length <= DISCORD_MAX_LENGTH) {
                    if (sentMessage) {
                        await sentMessage.edit(fullContent);
                    } else {
                        await channel.send(fullContent);
                    }
                    resolve(fullContent);
                } else {
                    if (sentMessage) {
                        await sentMessage.edit(fullContent.substring(0, DISCORD_MAX_LENGTH));
                    } else {
                        sentMessage = await channel.send(fullContent.substring(0, DISCORD_MAX_LENGTH));
                    }

                    const remaining = fullContent.substring(DISCORD_MAX_LENGTH);
                    const chunks = splitByLength(remaining, DISCORD_MAX_LENGTH);

                    for (const chunk of chunks) {
                        await channel.send(chunk);
                    }

                    resolve(fullContent);
                }
            } catch (error) {
                logger.error('STREAMING', `Error finalizing message: ${error.message}`);
                reject(error);
            }
        });

        response.data.on('error', (error) => {
            clearInterval(typingInterval);
            logger.error('STREAMING', `Stream error: ${error.message}`);
            reject(error);
        });
    });
}

function splitByLength(text, maxLength) {
    const chunks = [];
    let startPos = 0;

    while (startPos < text.length) {
        if (startPos + maxLength >= text.length) {
            chunks.push(text.substring(startPos));
            break;
        }

        let endPos = startPos + maxLength;

        while (endPos > startPos && text[endPos] !== ' ' && text[endPos] !== '\n') {
            endPos--;
        }

        if (endPos === startPos) {
            endPos = startPos + maxLength;
        } else {
            endPos++;
        }

        chunks.push(text.substring(startPos, endPos));
        startPos = endPos;
    }

    return chunks;
}

module.exports = {
    sendStreamingMessage,
    splitByLength
};
