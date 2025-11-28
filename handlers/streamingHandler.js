const axios = require('axios');
const logger = require('../utils/logger.js');
const { 
    API_REQUEST_TIMEOUT_MS, 
    DEFAULT_MAX_TOKENS,
    STREAM_UPDATE_INTERVAL_MS,
    STREAM_MIN_CHUNK_SIZE,
    STREAM_BATCH_UPDATE_SIZE,
    DISCORD_MESSAGE_MAX_LENGTH
} = require('../config/constants');

async function sendStreamingMessage(channel, messages, config = {}) {
    const Validators = require('../utils/validators');
    const ErrorHandler = require('../utils/ErrorHandler');
    
    const isDM = channel.type === 1;
    const enableStreaming = process.env.ENABLE_STREAMING !== 'false';
    
    // If streaming is disabled, return null to trigger fallback
    if (!enableStreaming) {
        logger.info('STREAMING', 'Streaming disabled via config, using fallback');
        throw new Error('Streaming disabled');
    }
    
    const apiUrl = process.env.LUNABY_BASE_URL || 'https://api.lunie.dev/v1';
    const apiKey = process.env.LUNABY_API_KEY;

    if (!apiKey) {
        throw new Error('LUNABY_API_KEY not configured');
    }

    const validMessages = Validators.cleanMessages(messages);
    if (validMessages.length === 0) {
        throw new Error('No valid messages to send');
    }

    const defaultModel = config.model || 'lunaby-pro';
    logger.info('STREAMING', `Starting stream with ${validMessages.length} messages, model: ${defaultModel}`);

    const response = await axios.post(
        `${apiUrl}/chat/completions`,
        {
            model: defaultModel,
            messages: validMessages,
            max_tokens: config.max_tokens || DEFAULT_MAX_TOKENS || 2048,
            stream: true,
            ...config
        },
        {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: API_REQUEST_TIMEOUT_MS || 120000,
            responseType: 'stream'
        }
    );

    let fullContent = '';
    let lastUpdate = Date.now();
    let sentMessage = null;
    let buffer = '';
    let updateCount = 0;
    let isUpdating = false;
    let lastSentLength = 0;
    let pendingUpdate = null;

    const typingInterval = setInterval(() => {
        channel.sendTyping().catch(() => { });
    }, 5000);
    
    // Improved update logic with debouncing
    const scheduleUpdate = async () => {
        if (isUpdating || !fullContent) return;
        
        const now = Date.now();
        const timeSinceLastUpdate = now - lastUpdate;
        const contentDelta = fullContent.length - lastSentLength;
        
        // Update conditions (more aggressive for smoother experience):
        const shouldUpdate = 
            !sentMessage || // First message
            contentDelta >= STREAM_BATCH_UPDATE_SIZE || // Enough new content
            (timeSinceLastUpdate >= STREAM_UPDATE_INTERVAL_MS && contentDelta >= STREAM_MIN_CHUNK_SIZE);
        
        if (shouldUpdate) {
            isUpdating = true;
            try {
                const contentToSend = fullContent.length > DISCORD_MESSAGE_MAX_LENGTH 
                    ? fullContent.substring(0, DISCORD_MESSAGE_MAX_LENGTH) 
                    : fullContent;
                
                if (!sentMessage) {
                    sentMessage = await channel.send(contentToSend);
                    logger.debug('STREAMING', `Initial message sent: ${contentToSend.length} chars`);
                } else if (fullContent.length <= DISCORD_MESSAGE_MAX_LENGTH && contentToSend !== sentMessage.content) {
                    await sentMessage.edit(contentToSend);
                    logger.debug('STREAMING', `Message updated: ${contentToSend.length} chars (delta: +${contentDelta})`);
                }
                
                lastUpdate = now;
                lastSentLength = fullContent.length;
                updateCount++;
            } catch (editError) {
                if (editError.code === 50027) { // Invalid webhook token
                    logger.warn('STREAMING', 'Message editing failed, will try final update');
                } else if (editError.code === 10008) { // Unknown message
                    logger.warn('STREAMING', 'Message was deleted, creating new one');
                    sentMessage = null;
                }
            } finally {
                isUpdating = false;
            }
        }
    };

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
                        
                        if (parsed.error) {
                            logger.error('STREAM', `API error: ${JSON.stringify(parsed.error)}`);
                        }

                        if (content) {
                            fullContent += content;
                            
                            // Schedule update with debouncing
                            if (pendingUpdate) {
                                clearTimeout(pendingUpdate);
                            }
                            
                            pendingUpdate = setTimeout(async () => {
                                await scheduleUpdate();
                                pendingUpdate = null;
                            }, 50); // Debounce by 50ms for smoother batching
                        }
                    } catch (e) {
                    }
                }
            }
        });

        response.data.on('end', async () => {
            clearInterval(typingInterval);
            
            // Clear any pending updates
            if (pendingUpdate) {
                clearTimeout(pendingUpdate);
            }

            // Wait for any in-progress updates
            let waitCount = 0;
            while (isUpdating && waitCount < 20) {
                await new Promise(resolve => setTimeout(resolve, 50));
                waitCount++;
            }

            logger.info('STREAMING', `Stream completed. Length: ${fullContent.length} chars, Updates: ${updateCount}, Avg update interval: ${updateCount > 0 ? Math.round((Date.now() - lastUpdate) / updateCount) : 0}ms`);

            try {
                // Final update to ensure complete content is sent
                if (fullContent.length <= DISCORD_MESSAGE_MAX_LENGTH) {
                    if (sentMessage && sentMessage.content !== fullContent) {
                        await sentMessage.edit(fullContent);
                        logger.debug('STREAMING', 'Final update applied');
                    } else if (!sentMessage) {
                        await channel.send(fullContent);
                    }
                    resolve(fullContent);
                } else {
                    // Handle long messages by splitting
                    const firstPart = fullContent.substring(0, DISCORD_MESSAGE_MAX_LENGTH);
                    
                    if (sentMessage && sentMessage.content !== firstPart) {
                        await sentMessage.edit(firstPart);
                    } else if (!sentMessage) {
                        sentMessage = await channel.send(firstPart);
                    }

                    const remaining = fullContent.substring(DISCORD_MESSAGE_MAX_LENGTH);
                    const chunks = splitByLength(remaining, DISCORD_MESSAGE_MAX_LENGTH);
                    
                    for (let i = 0; i < chunks.length; i++) {
                        await channel.send(chunks[i]);
                        // Small delay between chunks to avoid rate limiting
                        if (i < chunks.length - 1) {
                            await new Promise(resolve => setTimeout(resolve, 100));
                        }
                    }

                    logger.info('STREAMING', `Split into ${chunks.length + 1} messages`);
                    resolve(fullContent);
                }
            } catch (error) {
                ErrorHandler.logError('STREAMING', 'Error finalizing message', error);
                reject(error);
            }
        });

        response.data.on('error', (error) => {
            clearInterval(typingInterval);
            const ErrorHandler = require('../utils/ErrorHandler');
            ErrorHandler.logError('STREAMING', 'Stream error occurred', error);
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
