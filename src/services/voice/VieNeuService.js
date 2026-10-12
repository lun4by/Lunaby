const { Readable } = require('node:stream');
const defaultConfig = require('../../config/tts');

class TTSError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

// Decode RIFF chunks rather than assuming a fixed 44-byte WAV header.
function wavToStereo(frame) {
  if (frame.length < 12 || frame.toString('ascii', 0, 4) !== 'RIFF'
      || frame.toString('ascii', 8, 12) !== 'WAVE') throw new TTSError('invalid_audio');
  let format;
  const samples = [];
  for (let offset = 12; offset + 8 <= frame.length;) {
    const name = frame.toString('ascii', offset, offset + 4);
    const size = frame.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > frame.length) throw new TTSError('invalid_audio');
    if (name === 'fmt ') {
      if (size < 16) throw new TTSError('invalid_audio');
      format = {
        codec: frame.readUInt16LE(start),
        channels: frame.readUInt16LE(start + 2),
        rate: frame.readUInt32LE(start + 4),
        bits: frame.readUInt16LE(start + 14),
      };
    }
    if (name === 'data' && size) samples.push(frame.subarray(start, start + size));
    offset = start + size + (size % 2);
  }
  if (!format || format.codec !== 1 || format.rate !== 48000 || format.bits !== 16
      || ![1, 2].includes(format.channels)) throw new TTSError('invalid_audio');
  const pcm = Buffer.concat(samples);
  if (pcm.length % (2 * format.channels)) throw new TTSError('invalid_audio');
  if (format.channels === 2) return pcm;
  const stereo = Buffer.alloc(pcm.length * 2);
  for (let offset = 0; offset < pcm.length; offset += 2) {
    const sample = pcm.readInt16LE(offset);
    stereo.writeInt16LE(sample, offset * 2);
    stereo.writeInt16LE(sample, offset * 2 + 2);
  }
  return stereo;
}

async function* decodeFrames(body, bufferMs = 500) {
  let pending = Buffer.alloc(0);
  let complete = false;
  let anyAudio = false;
  let started = false;
  let buffered = [];
  let bufferedBytes = 0;
  const threshold = Math.ceil(48000 * 2 * 2 * bufferMs / 1000);
  for await (const chunk of body) {
    pending = Buffer.concat([pending, Buffer.from(chunk)]);
    while (pending.length >= 4) {
      if (complete) throw new TTSError('invalid_audio');
      const length = pending.readUInt32BE(0);
      if (length > 16 * 1024 * 1024) throw new TTSError('invalid_audio');
      if (pending.length < length + 4) break;
      const frame = pending.subarray(4, length + 4);
      pending = pending.subarray(length + 4);
      if (!length) { complete = true; continue; }
      const pcm = wavToStereo(frame);
      if (!pcm.length) continue; // WAV heartbeat with no samples.
      anyAudio = true;
      if (started) {
        yield pcm;
      } else {
        buffered.push(pcm);
        bufferedBytes += pcm.length;
        if (bufferedBytes >= threshold) {
          started = true;
          yield Buffer.concat(buffered);
          buffered = [];
        }
      }
    }
  }
  if (!complete || pending.length) throw new TTSError('truncated');
  if (!anyAudio) throw new TTSError('empty_audio');
  if (!started) yield Buffer.concat(buffered);
}

class VieNeuService {
  constructor({ config = defaultConfig, fetchImpl = globalThis.fetch } = {}) {
    this.config = config;
    this.fetch = fetchImpl;
  }

  async createStream(text, signal) {
    const apiKey = process.env.VIENEU_API_KEY;
    if (!apiKey) throw new TTSError('not_configured');
    const response = await this.fetch(`${this.config.apiBaseUrl}/tts/stream`, {
      method: 'POST',
      signal: AbortSignal.any([signal, AbortSignal.timeout(this.config.requestTimeoutMs)]),
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text, voiceId: this.config.voiceId, engine: 'v4', aiRefine: false,
        outputFormat: 'wav', sampleRate: 48000,
      }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new TTSError(response.status === 429 ? 'rate_limit'
        : [401, 403].includes(response.status) ? 'api_access' : 'api_error');
    }
    if (!response.body || response.headers.get('X-Output-Format') !== 'wav'
        || response.headers.get('X-Sample-Rate') !== '48000'
        || response.headers.get('X-Stream-Format') !== 'len32-wav-chunks') {
      await response.body?.cancel();
      throw new TTSError('invalid_audio');
    }
    // Raw for @discordjs/voice means 48 kHz, signed 16-bit little-endian stereo.
    return Readable.from(decodeFrames(response.body, this.config.bufferMs), { objectMode: false });
  }
}

module.exports = { VieNeuService, TTSError, decodeFrames, wavToStereo };
