const { Events } = require('discord.js');
const logger = require('../utils/logger.js');
const {
  activeVoiceChannels,
  cleanupZombieChannels,
  creatorChannels,
  loadLVoiceCache,
  processVoiceStateUpdate,
} = require('./voiceStateRuntime');

function setupVoiceStateEvent(client) {
  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    try {
      await processVoiceStateUpdate(oldState, newState);
    } catch (error) {
      logger.error('voice_toggle', 'Error handling voice state update:', error);
    }
  });

  logger.info('events', 'Registered event: VoiceStateUpdate');
}

module.exports = {
  setupVoiceStateEvent,
  loadLVoiceCache,
  cleanupZombieChannels,
  creatorChannels,
  activeVoiceChannels,
};
