const axios = require('axios');
const logger = require('../utils/logger.js');

const UPDATE_INTERVAL = 800;
const MIN_CHUNK_SIZE = 30;
const DISCORD_MAX_LENGTH = 2000;

async function sendStreamingMessage(channel, messages, config = {}) {
    const isDM = channel.type === 1;
    logger.debug('STREAM', `Starting stream in ${isDM ? 'DM' : 'guild channel'}`);
    logger.debug('STREAM', `Request messages: ${JSON.stringify(messages.slice(-2))}`); // Log last 2 messages for context
    
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
                        
                        // Log if there's an error in the response
                        if (parsed.error) {
                            logger.warn('STREAM', `API error: ${JSON.stringify(parsed.error)}`);
                        }
                        
                        // Log safety-related responses
                        if (content && (content.includes("can't help") || content.includes("sorry"))) {
                            logger.warn('STREAM', `Safety filter detected. Content: "${content}"`);
                            logger.warn('STREAM', `User messages (last 3): ${JSON.stringify(messages.slice(-3))}`);
                        }

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
                                        logger.debug('STREAM', `Sending initial message (length: ${fullContent.length})`);
                                        sentMessage = await channel.send(fullContent.length > DISCORD_MAX_LENGTH ? fullContent.substring(0, DISCORD_MAX_LENGTH) : fullContent);
                                        logger.debug('STREAM', `Initial message sent, ID: ${sentMessage.id}`);
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
            logger.debug('STREAM', `Finalizing message. Has sentMessage: ${!!sentMessage}`);
            
            // Log full content if it contains safety-related messages
            if (fullContent.includes("can't help") || fullContent.includes("I'm sorry")) {
                logger.warn('STREAM', `=== SAFETY FILTER TRIGGERED ===`);
                logger.warn('STREAM', `Full response: "${fullContent}"`);
                logger.warn('STREAM', `All user messages in conversation: ${JSON.stringify(messages)}`);
                logger.warn('STREAM', `===== END SAFETY FILTER LOG =====`);
            }

            try {
                if (fullContent.length <= DISCORD_MAX_LENGTH) {
                    if (sentMessage) {
                        await sentMessage.edit(fullContent);
                        logger.debug('STREAM', `Final edit completed for message ${sentMessage.id}`);
                    } else {
                        logger.warn('STREAM', 'No message sent during stream, sending now');
                        const finalMsg = await channel.send(fullContent);
                        logger.debug('STREAM', `Final message sent, ID: ${finalMsg.id}`);
                    }
                    resolve(fullContent);
                } else {
                    logger.debug('STREAM', `Message exceeds ${DISCORD_MAX_LENGTH} chars, splitting into chunks`);
                    if (sentMessage) {
                        await sentMessage.edit(fullContent.substring(0, DISCORD_MAX_LENGTH));
                    } else {
                        sentMessage = await channel.send(fullContent.substring(0, DISCORD_MAX_LENGTH));
                        logger.debug('STREAM', `First chunk sent, ID: ${sentMessage.id}`);
                    }

                    const remaining = fullContent.substring(DISCORD_MAX_LENGTH);
                    const chunks = splitByLength(remaining, DISCORD_MAX_LENGTH);
                    
                    logger.debug('STREAM', `Sending ${chunks.length} additional chunk(s)`);
                    for (let i = 0; i < chunks.length; i++) {
                        const chunkMsg = await channel.send(chunks[i]);
                        logger.debug('STREAM', `Chunk ${i + 1}/${chunks.length} sent, ID: ${chunkMsg.id}`);
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
            logger.error('STREAMING', `Full error: ${JSON.stringify(error)}`);
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
