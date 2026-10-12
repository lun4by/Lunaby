const voice = require('@discordjs/voice');
const config = require('../../config/tts');
const { VieNeuService, TTSError } = require('./VieNeuService');

class TTSService {
  constructor({ voiceApi = voice, provider = new VieNeuService(), settings = config } = {}) {
    this.voice = voiceApi;
    this.provider = provider;
    this.config = settings;
    this.sessions = new Map();
  }

  destroy(session) {
    if (this.sessions.get(session.guildId) !== session) return;
    this.sessions.delete(session.guildId);
    clearTimeout(session.idleTimer);
    session.controller?.abort();
    session.stream?.destroy();
    session.player?.stop(true);
    if (session.connection?.state.status !== this.voice.VoiceConnectionStatus.Destroyed) {
      session.connection?.destroy();
    }
  }

  handleVoiceStateUpdate(oldState, newState) {
    if (newState.id !== newState.client.user?.id) return;
    const session = this.sessions.get(newState.guild.id);
    if (session && newState.channelId !== session.channelId) this.destroy(session);
  }

  leave(guildId) {
    const session = this.sessions.get(guildId);
    const connection = this.voice.getVoiceConnection(guildId);
    if (session) this.destroy(session);
    if (connection && connection.state.status !== this.voice.VoiceConnectionStatus.Destroyed) {
      connection.destroy();
    }
    return Boolean(session || connection);
  }

  async speak(guild, channelId, text, onStart) {
    let session = this.sessions.get(guild.id);
    if (session?.busy) throw new TTSError('busy');
    const existing = this.voice.getVoiceConnection(guild.id);
    if (existing && existing !== session?.connection) throw new TTSError('busy');
    if (session && session.channelId !== channelId) {
      this.destroy(session);
      session = null;
    }
    if (!session) {
      session = { guildId: guild.id, channelId };
      this.sessions.set(guild.id, session);
    }
    // Reserve synchronously, before any network request or voice connection awaits.
    session.busy = true;
    clearTimeout(session.idleTimer);
    const controller = new AbortController();
    session.controller = controller;
    const deadline = setTimeout(() => controller.abort(), this.config.playbackTimeoutMs);
    try {
      if (!session.connection) {
        session.connection = this.voice.joinVoiceChannel({
          channelId, guildId: guild.id, adapterCreator: guild.voiceAdapterCreator,
          selfDeaf: true, selfMute: false,
        });
        session.connection.on('error', () => this.destroy(session));
        session.connection.on('stateChange', (_, state) => {
          if ([this.voice.VoiceConnectionStatus.Disconnected,
            this.voice.VoiceConnectionStatus.Destroyed].includes(state.status)) this.destroy(session);
        });
      }
      await this.voice.entersState(session.connection, this.voice.VoiceConnectionStatus.Ready,
        AbortSignal.any([controller.signal, AbortSignal.timeout(this.config.connectionTimeoutMs)]));
      controller.signal.throwIfAborted();
      const stream = await this.provider.createStream(text, controller.signal);
      session.stream = stream;
      if (controller.signal.aborted) stream.destroy();
      controller.signal.throwIfAborted();
      const player = this.voice.createAudioPlayer({
        behaviors: { noSubscriber: this.voice.NoSubscriberBehavior.Stop },
      });
      session.player = player;
      await new Promise((resolve, reject) => {
        let ended = false;
        let audioEnded = false;
        let notice = Promise.resolve();
        const finish = (error) => {
          if (ended) return;
          ended = true;
          controller.signal.removeEventListener('abort', aborted);
          player.removeListener('error', failed);
          player.on('error', () => {});
          player.removeListener(this.voice.AudioPlayerStatus.Idle, idle);
          player.removeListener(this.voice.AudioPlayerStatus.Playing, started);
          stream.removeListener('end', audioComplete);
          // Retain an error listener while destroy propagates through the pipeline.
          notice.finally(() => { error ? reject(error) : resolve(); });
        };
        const aborted = () => finish(new TTSError('interrupted'));
        const failed = () => finish(new TTSError('playback_error'));
        const idle = () => finish(audioEnded ? null : new TTSError('interrupted'));
        const audioComplete = () => { audioEnded = true; };
        const started = () => { notice = Promise.resolve().then(onStart).catch(() => {}); };
        controller.signal.addEventListener('abort', aborted, { once: true });
        stream.once('error', (error) => finish(error));
        stream.once('end', audioComplete);
        player.on('error', failed);
        player.once(this.voice.AudioPlayerStatus.Playing, started);
        player.once(this.voice.AudioPlayerStatus.Idle, idle);
        try {
          const resource = this.voice.createAudioResource(stream, { inputType: this.voice.StreamType.Raw });
          if (!session.connection.subscribe(player)) throw new TTSError('playback_error');
          player.play(resource);
        } catch (error) { finish(error); }
      });
      session.busy = false;
      session.stream = null;
      session.player = null;
      session.controller = null;
      session.idleTimer = setTimeout(() => this.destroy(session), this.config.idleTimeoutMs);
      session.idleTimer.unref?.();
    } catch (error) {
      const interrupted = controller.signal.aborted;
      this.destroy(session);
      throw interrupted && !(error instanceof TTSError)
        ? new TTSError('interrupted') : error;
    } finally {
      clearTimeout(deadline);
    }
  }
}

module.exports = new TTSService();
module.exports.TTSService = TTSService;
