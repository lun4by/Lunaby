const {
  SlashCommandBuilder,
  MessageFlags,
  PermissionFlagsBits,
  GatewayIntentBits,
  ChannelType,
} = require('discord.js');
const tts = require('../../services/voice/TTSService');
const config = require('../../config/tts');
const logger = require('../../utils/core/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tts')
    .setDescription('Đọc nội dung trong kênh voice của bạn')
    .addStringOption(option =>
      option
        .setName('noidung')
        .setDescription('Nội dung cần đọc, tối đa 150 ký tự')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(config.maxCharacters)),
  prefix: {
    name: 'tts',
    aliases: ['speak'],
    description: 'Đọc nội dung trong kênh voice',
    usage: 'tts <nội dung>',
  },
  cooldown: 5,

  async execute(interaction) {
    const slash = interaction.isChatInputCommand();
    const payload = content => ({
      content,
      allowedMentions: { parse: [] },
      ...(slash ? { flags: MessageFlags.Ephemeral } : {}),
    });
    const deny = key => interaction.reply(payload(interaction.t(`commands.tts.${key}`)));
    if (!interaction.guild) {
      return deny('guild_only');
    }

    if (!interaction.client.options.intents.has(GatewayIntentBits.GuildVoiceStates)) {
      return deny('intent_required');
    }

    // Preserve mentions in prefix text, the shared option parser removes user mentions.
    const text = (interaction.message
      ? interaction.args.join(' ')
      : interaction.options.getString('noidung'))?.trim();
    if (!text) {
      return deny('empty');
    }

    if (text.length > config.maxCharacters) {
      return deny('too_long');
    }

    const channel = interaction.member?.voice?.channel
      || interaction.guild.voiceStates.cache.get(interaction.user.id)?.channel;
    if (!channel) {
      return deny('join_voice');
    }

    if (channel.type !== ChannelType.GuildVoice) {
      return deny('voice_only');
    }

    const me = interaction.guild.members.me || await interaction.guild.members.fetchMe();
    if (!channel.permissionsFor(me)?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.Speak,
    ])) {
      return deny('permissions');
    }

    if (channel.full && me.voice.channelId !== channel.id
      && !channel.permissionsFor(me).has(PermissionFlagsBits.MoveMembers)) {
      return deny('channel_full');
    }

    if (!process.env.VIENEU_API_KEY) {
      return deny('not_configured');
    }

    await interaction.deferReply(slash ? { flags: MessageFlags.Ephemeral } : {});

    try {
      await tts.speak(interaction.guild, channel.id, text, () => interaction.editReply({
        content: interaction.t('commands.tts.playing', { channel: `<#${channel.id}>` }),
        allowedMentions: { parse: [] },
      }));
      await interaction.editReply({ content: interaction.t('commands.tts.done') });
    } catch (error) {
      const known = [
        'busy',
        'not_configured',
        'rate_limit',
        'api_access',
        'api_error',
        'invalid_audio',
        'truncated',
        'empty_audio',
        'interrupted',
        'playback_error',
      ];
      const key = known.includes(error.code) ? error.code : 'error';
      logger.warn('tts', `TTS failed | guild=${interaction.guild.id} | code=${key}`);
      await interaction.editReply({ content: interaction.t(`commands.tts.${key}`) });
    }
  },
};
