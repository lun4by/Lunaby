const axios = require('axios');
const logger = require('../utils/logger.js');
const { splitMessageRespectWords } = require('./messageHandler');

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
  let sentMessages = [];
  let buffer = '';
  let updateCount = 0;

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
                fullContent.length % 200 === 0;

              if (shouldUpdate) {
                try {
                  const messageIndex = Math.floor(fullContent.length / DISCORD_MAX_LENGTH);
                  const startPos = messageIndex * DISCORD_MAX_LENGTH;
                  const currentChunk = fullContent.substring(startPos, startPos + DISCORD_MAX_LENGTH);

                  if (!sentMessages[messageIndex]) {
                    sentMessages[messageIndex] = await channel.send(currentChunk);
                    updateCount++;
                  } else {
                    await sentMessages[messageIndex].edit(currentChunk);
                    updateCount++;
                  }
                  
                  lastUpdate = now;
                } catch (editError) {
                  logger.warn('STREAMING', `Failed to update message: ${editError.message}`);
                }
              }
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    });

    response.data.on('end', async () => {
      clearInterval(typingInterval);
      
      logger.info('STREAMING', `Stream completed. Total length: ${fullContent.length}, Updates: ${updateCount}, Messages: ${sentMessages.length}`);

      try {
        const chunks = splitMessageRespectWords(fullContent, DISCORD_MAX_LENGTH);
        
        for (let i = 0; i < chunks.length; i++) {
          if (sentMessages[i]) {
            await sentMessages[i].edit(chunks[i]);
          } else {
            sentMessages[i] = await channel.send(chunks[i]);
          }
        }
        
        resolve(fullContent);
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

module.exports = {
  sendStreamingMessage
};
