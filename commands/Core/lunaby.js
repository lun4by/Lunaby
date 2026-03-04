const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createLunabyEmbed } = require('../../utils/embedUtils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lunaby')
    .setDescription('Giới thiệu về VTuber Lunaby'),
  cooldown: 30,

  async execute(interaction) {
    const embed = createLunabyEmbed()
      .setColor(0xFF69B4)
      .setTitle('🌙 Lunaby Hojo - VTuber')
      .setURL('https://www.youtube.com/@LunabyHojo')
      .setDescription(
        '**Chào mừng đến với kênh YouTube của Lunaby!** ✨\n\n' +
        'Lunaby là một VTuber với phong cách dễ thương và thân thiện, mang đến những nội dung giải trí đầy màu sắc!\n\n' +
        '🎮 **Nội dung chính:**\n' +
        '• Gaming streams & Let\'s Play\n' +
        '• Chatting & Just Chatting\n' +
        '• Music & Karaoke\n' +
        '• Creative content & Art\n\n' +
        '💖 Hãy ghé thăm kênh và ủng hộ Lunaby nhé!'
      )
      .setThumbnail('https://yt3.googleusercontent.com/ytc/AIdro_mF-X7qVxGxQdVt5aQHxKvJ7ZqJxVQ_0JqXwLqB=s160-c-k-c0x00ffffff-no-rj')
      .addFields(
        { name: '📺 Kênh YouTube', value: '[Lunaby Hojo](https://www.youtube.com/@LunabyHojo)', inline: true },
        { name: '🌸 Đặc điểm', value: 'Dễ thương & Thân thiện', inline: true }
      )
      .setImage('https://yt3.googleusercontent.com/oNdSvqHsFNRiwO5X_wczBznDt7KfWBOkfwrOHlY49T8LmcWNK-RbSPUx2sEDHfRYX2Kks-Bw=w2120-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj')
      .setFooter({ text: 'Cảm ơn bạn đã ủng hộ Lunaby! 💕' });

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setLabel('🎥 Xem kênh YouTube')
          .setURL('https://www.youtube.com/@LunabyHojo')
          .setStyle(ButtonStyle.Link),
        new ButtonBuilder()
          .setLabel('🔔 Subscribe')
          .setURL('https://www.youtube.com/@LunabyHojo?sub_confirmation=1')
          .setStyle(ButtonStyle.Link)
      );

    await interaction.reply({ embeds: [embed], components: [row] });
  }
};
