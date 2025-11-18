const axios = require('axios');
const logger = require('../utils/logger.js');

const UPDATE_INTERVAL = 800; // Update every 800ms to avoid Discord rate limit (5 edits/5s)
const MIN_CHUNK_SIZE = 30; // Minimum characters before first update
const DISCORD_MAX_LENGTH = 2000;

/**
 * Send streaming message to Discord channel with real-time updates
 * @param {Object} channel - Discord channel object
 * @param {Array} messages - Chat messages array
 * @param {Object} config - Configuration options
 * @returns {Promise<string>} - Complete message content
 */
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

  // Start typing indicator
  const typingInterval = setInterval(() => {
    channel.sendTyping().catch(() => {});
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
                fullContent.length % 200 === 0; // Also update every 200 chars

              if (shouldUpdate) {
                try {
                  if (!sentMessage) {
                    // First message - send it
                    const displayContent = fullContent.length > DISCORD_MAX_LENGTH 
                      ? fullContent.substring(0, DISCORD_MAX_LENGTH - 50) + '\n\n*[Đang tiếp tục...]*'
                      : fullContent;
                    sentMessage = await channel.send(displayContent);
                    updateCount++;
                  } else if (fullContent.length <= DISCORD_MAX_LENGTH) {
                    // Update existing message if within Discord limit
                    await sentMessage.edit(fullContent);
                    updateCount++;
                  }
                  lastUpdate = now;
                } catch (editError) {
                  logger.warn('STREAMING', `Failed to update message: ${editError.message}`);
                }
              }
            }
          } catch (e) {
            // Ignore parse errors (incomplete JSON)
          }
        }
      }
    });

    response.data.on('end', async () => {
      clearInterval(typingInterval);
      
      logger.info('STREAMING', `Stream completed. Total length: ${fullContent.length}, Updates: ${updateCount}`);

      try {
        // Final update with complete content
        if (fullContent.length <= DISCORD_MAX_LENGTH) {
          if (sentMessage) {
            await sentMessage.edit(fullContent);
          } else {
            sentMessage = await channel.send(fullContent);
          }
          resolve(fullContent);
        } else {
          // Content too long - split into multiple messages
          if (sentMessage) {
            await sentMessage.edit(fullContent.substring(0, DISCORD_MAX_LENGTH));
          }
          
          // Send remaining content in new messages
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

/**
 * Split text into chunks respecting word boundaries
 */
function splitByLength(text, maxLength) {
  const chunks = [];
  let startPos = 0;

  while (startPos < text.length) {
    if (startPos + maxLength >= text.length) {
      chunks.push(text.substring(startPos));
      break;
    }

    let endPos = startPos + maxLength;
    
    // Find nearest word boundary
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
