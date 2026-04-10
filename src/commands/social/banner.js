const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { createLunabyEmbed } = require('../../utils/embedUtils');
const logger = require('../../utils/logger');
const emojis = require('../../config/emojis');

function buildBannerActionRow(url) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Mở ảnh gốc')
      .setStyle(ButtonStyle.Link)
      .setURL(url),
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('banner')
    .setDescription('Xem banner của bạn hoặc người dùng khác')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Người dùng mà bạn muốn xem banner')
        .setRequired(false)),
  prefix: {
    name: 'banner',
    aliases: ['cover'],
    description: 'Xem banner của bạn hoặc người dùng khác',
  },
  cooldown: 5,

  async execute(interaction) {
    try {
      const targetUser = interaction.options.getUser('user') || interaction.user;
      const fetchedUser = await interaction.client.users.fetch(targetUser.id, { force: true });
      const bannerUrl = fetchedUser.bannerURL({ size: 4096 });

      if (!bannerUrl) {
        return interaction.reply({
          content: `${emojis.error} ${targetUser} chưa cài banner.`,
          ephemeral: true,
        });
      }

      const embed = createLunabyEmbed()
        .setAuthor({
          name: `Banner của ${fetchedUser.tag}`,
          iconURL: fetchedUser.displayAvatarURL({ size: 256 }),
        })
        .setDescription(`[Nhấn vào đây để mở ảnh gốc](${bannerUrl})`)
        .setImage(bannerUrl);

      await interaction.reply({
        embeds: [embed],
        components: [buildBannerActionRow(bannerUrl)],
      });
    } catch (error) {
      logger.error('BANNER', 'Error in banner command:', error);
      const payload = {
        content: `${emojis.error} Đã xảy ra lỗi khi tải banner!`,
        ephemeral: true,
      };
      const respond = interaction.replied || interaction.deferred
        ? interaction.followUp(payload)
        : interaction.reply(payload);
      await respond.catch(() => { });
    }
  },
};