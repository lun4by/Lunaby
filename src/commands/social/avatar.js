const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { createLunabyEmbed } = require('../../utils/embedUtils');
const logger = require('../../utils/logger');
const emojis = require('../../config/emojis');

function buildAvatarActionRow(url, interaction) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel(interaction.t('commands.avatar.open_original'))
      .setStyle(ButtonStyle.Link)
      .setURL(url),
  );
}

function resolveNickname(member, user) {
  return member?.nickname || user.globalName || user.username;
}

function resolveRoleColor(member, interaction) {
  if (!member || !member.displayHexColor || member.displayHexColor === '#000000') {
    return interaction.t('commands.avatar.none');
  }

  return member.displayHexColor;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Xem avatar của bạn hoặc người dùng khác')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Người dùng mà bạn muốn xem avatar')
        .setRequired(false)),
  prefix: {
    name: 'avatar',
    aliases: ['avt', 'av'],
    description: 'Xem avatar của bạn hoặc người dùng khác',
  },
  cooldown: 5,

  async execute(interaction) {
    try {
      const targetUser = interaction.options.getUser('user') || interaction.user;
      const member = interaction.guild
        ? await interaction.guild.members.fetch(targetUser.id).catch(() => null)
        : null;

      const avatarUrl = member
        ? member.displayAvatarURL({ size: 4096 })
        : targetUser.displayAvatarURL({ size: 4096 });
      const nickname = resolveNickname(member, targetUser);
      const roleColor = resolveRoleColor(member, interaction);

      const embed = createLunabyEmbed()
        .setAuthor({
          name: interaction.t('commands.avatar.title', { tag: targetUser.tag }),
          iconURL: targetUser.displayAvatarURL({ size: 256 }),
        })
        .setDescription(
          [
            `${interaction.t('commands.avatar.nickname')} ${nickname}`,
            `${interaction.t('commands.avatar.id')} ${targetUser.id}`,
            `${interaction.t('commands.avatar.role_color')} ${roleColor}`,
          ].join('\n')
        )
        .setImage(avatarUrl);

      await interaction.reply({
        embeds: [embed],
        components: [buildAvatarActionRow(avatarUrl, interaction)],
      });
    } catch (error) {
      logger.error('AVATAR', 'Error in avatar command:', error);
      const payload = {
        content: `${emojis.error} ${interaction.t('commands.avatar.error')}`,
        ephemeral: true,
      };
      const respond = interaction.replied || interaction.deferred
        ? interaction.followUp(payload)
        : interaction.reply(payload);
      await respond.catch(() => { });
    }
  },
};
