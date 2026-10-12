module.exports = {
  apiBaseUrl: 'https://api.vieneu.io/api/v1',
  voiceId: process.env.VIENEU_VOICE_ID || 'Ngọc Lan',
  maxCharacters: 150,
  idleTimeoutMs: 5 * 60 * 1000,
  requestTimeoutMs: 120 * 1000,
  playbackTimeoutMs: 5 * 60 * 1000,
  connectionTimeoutMs: 20 * 1000,
  bufferMs: 500,
};
