const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { EventEmitter } = require('node:events');
const { VieNeuService, decodeFrames, wavToStereo } = require('../src/services/voice/VieNeuService');
const { TTSService } = require('../src/services/voice/TTSService');
const config = require('../src/config/tts');

function wav(samples = [100, -100], channels = 1) {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVE', 8);
  buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(48000, 24); buffer.writeUInt32LE(48000 * channels * 2, 28);
  buffer.writeUInt16LE(channels * 2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((sample, index) => buffer.writeInt16LE(sample, 44 + index * 2));
  return buffer;
}
function frame(audio) {
  const length = Buffer.alloc(4); length.writeUInt32BE(audio.length);
  return Buffer.concat([length, audio]);
}
async function collect(body, bufferMs = 500) {
  const audio = [];
  for await (const chunk of decodeFrames(body, bufferMs)) audio.push(chunk);
  return Buffer.concat(audio);
}

test('WAV mono becomes stereo; stereo stays intact; bad rate is rejected', () => {
  assert.deepEqual([...wavToStereo(wav()).values()], [100, 0, 100, 0, 156, 255, 156, 255]);
  assert.deepEqual(wavToStereo(wav([100, -100], 2)), Buffer.from([100, 0, 156, 255]));
  const invalid = wav(); invalid.writeUInt32LE(24000, 24);
  assert.throws(() => wavToStereo(invalid), { code: 'invalid_audio' });
});

test('fragmented frames and heartbeat produce only real audio', async () => {
  const wire = Buffer.concat([frame(wav([])), frame(wav()), Buffer.alloc(4)]);
  const chunks = Array.from({ length: wire.length }, (_, i) => wire.subarray(i, i + 1));
  assert.deepEqual(await collect(Readable.from(chunks)), wavToStereo(wav()));
});

test('truncated, empty, oversized, and trailing data streams fail', async () => {
  await assert.rejects(collect(Readable.from([frame(wav())])), { code: 'truncated' });
  await assert.rejects(collect(Readable.from([frame(wav([])), Buffer.alloc(4)])), { code: 'empty_audio' });
  await assert.rejects(collect(Readable.from([Buffer.from([255, 255, 255, 255])])), { code: 'invalid_audio' });
  await assert.rejects(collect(Readable.from([frame(wav()), Buffer.alloc(5)])), { code: 'truncated' });
});

test('audio is yielded before the stream finishes once buffer threshold is met', async () => {
  let finish;
  const gate = new Promise(resolve => { finish = resolve; });
  async function* body() { yield frame(wav()); await gate; yield Buffer.alloc(4); }
  const decoder = decodeFrames(body(), 0);
  assert.equal((await decoder.next()).value.length, 8);
  finish();
  assert.equal((await decoder.next()).done, true);
});

test('provider sends documented request and validates audio headers', async () => {
  const originalKey = process.env.VIENEU_API_KEY;
  process.env.VIENEU_API_KEY = 'test-placeholder';
  try {
    let request;
    const provider = new VieNeuService({ fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(Buffer.concat([frame(wav()), Buffer.alloc(4)]), { headers: {
        'X-Output-Format': 'wav', 'X-Sample-Rate': '48000', 'X-Stream-Format': 'len32-wav-chunks',
      } });
    } });
    const stream = await provider.createStream('Xin chào', new AbortController().signal);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    assert.equal(Buffer.concat(chunks).length, 8);
    assert.equal(request.url, 'https://api.vieneu.io/api/v1/tts/stream');
    assert.equal(JSON.parse(request.options.body).outputFormat, 'wav');
    assert.equal(JSON.parse(request.options.body).sampleRate, 48000);
    const limited = new VieNeuService({ fetchImpl: async () => new Response('', { status: 429 }) });
    await assert.rejects(limited.createStream('x', new AbortController().signal), { code: 'rate_limit' });
  } finally {
    if (originalKey === undefined) delete process.env.VIENEU_API_KEY;
    else process.env.VIENEU_API_KEY = originalKey;
  }
});

function fakeVoice() {
  const api = {
    VoiceConnectionStatus: { Ready: 'ready', Disconnected: 'disconnected', Destroyed: 'destroyed' },
    AudioPlayerStatus: { Playing: 'playing', Idle: 'idle' },
    NoSubscriberBehavior: { Stop: 'stop' }, StreamType: { Raw: 'raw' },
    getVoiceConnection() {},
    async entersState() {},
    joinVoiceChannel() {
      const connection = new EventEmitter();
      connection.state = { status: 'ready' };
      connection.subscribe = () => ({});
      connection.destroy = () => {
        connection.state = { status: 'destroyed' };
        connection.emit('stateChange', {}, connection.state);
      };
      return connection;
    },
    createAudioResource(stream) { return stream; },
    createAudioPlayer() {
      const player = new EventEmitter();
      player.stop = () => player.emit('idle');
      player.play = stream => {
        player.emit('playing');
        stream.once('end', () => setImmediate(() => player.emit('idle')));
        stream.resume();
      };
      return player;
    },
  };
  return api;
}
const guild = { id: 'guild', voiceAdapterCreator: {} };

test('session is reserved before awaits, blocks other channels, and stop unlocks it', async () => {
  let signal;
  const service = new TTSService({ voiceApi: fakeVoice(), provider: {
    createStream(_, abortSignal) {
      signal = abortSignal;
      return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
    },
  } });
  const first = service.speak(guild, 'channel-a', 'hello');
  const interrupted = assert.rejects(first, { code: 'interrupted' });
  await assert.rejects(service.speak(guild, 'channel-b', 'hello'), { code: 'busy' });
  assert.throws(() => service.stop(guild.id, 'channel-b'), { code: 'different_channel' });
  service.stop(guild.id, 'channel-a');
  await interrupted;
  assert.equal(service.sessions.size, 0);
});

test('successful playback waits for notification, then leaves after idle timeout', async () => {
  const service = new TTSService({ voiceApi: fakeVoice(),
    provider: { async createStream() { return Readable.from([Buffer.alloc(3840)]); } },
    settings: { ...config, idleTimeoutMs: 20 },
  });
  let notified = false;
  await service.speak(guild, 'channel-a', 'hello', async () => {
    await new Promise(resolve => setTimeout(resolve, 5)); notified = true;
  });
  assert.equal(notified, true);
  assert.equal(service.sessions.get(guild.id).busy, false);
  await new Promise(resolve => setTimeout(resolve, 35));
  assert.equal(service.sessions.size, 0);
});

test('API failure and bot being moved clean up the session', async () => {
  const service = new TTSService({ voiceApi: fakeVoice(), provider: {
    async createStream() { throw new Error('upstream failure'); },
  } });
  await assert.rejects(service.speak(guild, 'channel-a', 'hello'), /upstream failure/);
  assert.equal(service.sessions.size, 0);
  service.sessions.set(guild.id, { guildId: guild.id, channelId: 'channel-a' });
  service.handleVoiceStateUpdate({}, { id: 'bot', client: { user: { id: 'bot' } }, guild, channelId: 'channel-b' });
  assert.equal(service.sessions.size, 0);
});

test('real Discord voice pipeline encodes stereo PCM to Opus without FFmpeg', async () => {
  const voice = require('@discordjs/voice');
  const resource = voice.createAudioResource(Readable.from([Buffer.alloc(3840)]), { inputType: voice.StreamType.Raw });
  const packets = [];
  for await (const packet of resource.playStream) packets.push(packet);
  assert.ok(packets.length > 0);
});

test('mid-playback disconnect cancels audio and releases the session', async () => {
  const source = new Readable({ read() {} });
  const service = new TTSService({ voiceApi: fakeVoice(),
    provider: { async createStream() { return source; } },
  });
  let playing;
  const started = new Promise(resolve => { playing = resolve; });
  const pending = service.speak(guild, 'channel-a', 'hello', playing);
  const rejected = assert.rejects(pending, { code: 'interrupted' });
  await started;
  service.sessions.get(guild.id).connection.emit('stateChange', {}, { status: 'disconnected' });
  await rejected;
  assert.equal(service.sessions.size, 0);
  assert.equal(source.destroyed, true);
});

test('playback timeout aborts a stalled stream and releases the session', async () => {
  const source = new Readable({ read() {} });
  const service = new TTSService({ voiceApi: fakeVoice(),
    provider: { async createStream() { return source; } }, settings: { ...config, playbackTimeoutMs: 20 },
  });
  await assert.rejects(service.speak(guild, 'channel-a', 'hello'), { code: 'interrupted' });
  assert.equal(service.sessions.size, 0);
  assert.equal(source.destroyed, true);
});

test('slash and prefix commands use the same voice service and preserve prefix mentions', async () => {
  const { GatewayIntentBits, IntentsBitField, ChannelType } = require('discord.js');
  const { PseudoInteraction } = require('../src/handlers/commands/prefixCommandRuntime');
  const command = require('../src/commands/social/tts');
  const singleton = require('../src/services/voice/TTSService');
  const originalSpeak = singleton.speak;
  const originalKey = process.env.VIENEU_API_KEY;
  process.env.VIENEU_API_KEY = 'test-placeholder';
  const calls = [];
  singleton.speak = async (server, channelId, text, onStart) => {
    calls.push({ server, channelId, text }); await onStart();
  };
  try {
    const channel = { id: 'voice', type: ChannelType.GuildVoice, full: false,
      permissionsFor: () => ({ has: () => true }) };
    const server = { id: 'guild', members: { me: { voice: {} } }, voiceStates: { cache: new Map() } };
    const member = { voice: { channel, channelId: channel.id } };
    const client = { options: { intents: new IntentsBitField([GatewayIntentBits.GuildVoiceStates]) } };
    const replies = [];
    const slash = { guild: server, member, client, user: { id: 'user' },
      isChatInputCommand: () => true, options: { getString: () => 'Xin chào' }, t: key => key,
      reply: async p => replies.push(p), deferReply: async p => replies.push(p),
      editReply: async p => replies.push(p),
    };
    assert.equal(command.data.toJSON().options[0].name, 'noidung');
    assert.equal(command.data.toJSON().options[0].max_length, 150);
    await command.execute(slash);
    const sent = { edit: async p => replies.push(p) };
    const message = { guild: server, guildId: server.id, member, client, author: { id: 'user' },
      t: key => key, content: '!speak Xin chào <@123456789012345678>',
      mentions: { users: { first: () => ({ id: '123456789012345678' }) }, channels: { first: () => null } },
      reply: async p => { replies.push(p); return sent; },
    };
    const prefix = new PseudoInteraction(message, 'speak', ['Xin', 'chào', '<@123456789012345678>'], command);
    await command.execute(prefix);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].text, 'Xin chào');
    assert.equal(calls[1].text, 'Xin chào <@123456789012345678>');
    assert.equal(calls[1].channelId, 'voice');
    await command.execute({ ...slash, options: { getString: () => 'x'.repeat(151) } });
    assert.equal(calls.length, 2);
    assert.equal(replies.at(-1).content, 'commands.tts.too_long');
    await command.execute({ ...slash, member: { voice: {} } });
    assert.equal(replies.at(-1).content, 'commands.tts.join_voice');
    await command.execute({ ...slash, member: { voice: { channel: { ...channel,
      permissionsFor: () => ({ has: () => false }) } } } });
    assert.equal(replies.at(-1).content, 'commands.tts.permissions');
  } finally {
    singleton.speak = originalSpeak;
    if (originalKey === undefined) delete process.env.VIENEU_API_KEY;
    else process.env.VIENEU_API_KEY = originalKey;
  }
});
