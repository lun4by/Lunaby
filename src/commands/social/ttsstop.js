const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const tts = require('../../services/voice/TTSService');

module.exports = {
  data: new SlashCommandBuilder().setName('ttsstop').setDescription('Dừng TTS và cho bot rời kênh voice'),
  prefix: { name: 'ttsstop', aliases: ['stopspeak'], description: 'Dừng TTS và rời kênh voice' },
  cooldown: 2,
  async execute(interaction) {
    let key = 'stopped';
    const channelId = interaction.member?.voice?.channelId
      || interaction.guild?.voiceStates.cache.get(interaction.user.id)?.channelId;
    if (!interaction.guild) key = 'guild_only';
    else if (!channelId) key = 'join_voice';
    else {
      try { tts.stop(interaction.guild.id, channelId); }
      catch (error) { key = error.code === 'different_channel' ? 'different_channel' : 'no_session'; }
    }
    await interaction.reply({ content: interaction.t(`commands.tts.${key}`),
      ...(interaction.isChatInputCommand() ? { flags: MessageFlags.Ephemeral } : {}) });
  },
};
