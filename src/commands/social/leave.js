const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { hasMemberPermission } = require('../../utils/discord/permissionUtils');
const tts = require('../../services/voice/TTSService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Dừng phát và cho bot rời kênh voice')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  prefix: {
    name: 'leave',
    description: 'Dừng phát và cho bot rời kênh voice (Manage Server)',
  },
  cooldown: 2,

  async execute(interaction) {
    let key;
    if (!interaction.guild) {
      key = 'guild_only';
    } else if (!hasMemberPermission(interaction.member, PermissionFlagsBits.ManageGuild)) {
      key = 'permission';
    } else {
      key = tts.leave(interaction.guild.id) ? 'done' : 'not_connected';
    }

    await interaction.reply({
      content: interaction.t(`commands.leave.${key}`),
      ...(interaction.isChatInputCommand() ? { flags: MessageFlags.Ephemeral } : {}),
    });
  },
};
