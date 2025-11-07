const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cyrene')
    .setDescription('Giới thiệu Cyrene - Nhân vật trong Honkai Star Rail'),

  async execute(interaction) {
    const videoURL = 'https://www.youtube.com/watch?v=rtSkMbDs1Xw';
    const thumbnailURL = 'https://i.ytimg.com/vi/rtSkMbDs1Xw/maxresdefault.jpg';

    const embed = new EmbedBuilder()
      .setColor(0x7EC8E3)
      .setTitle('⭐ Cyrene - Honkai Star Rail')
      .setURL(videoURL)
      .setDescription(
        '🎮 **Nhân vật trong Honkai Star Rail**\n\n' +
        '> *Một nhân vật với thiết kế độc đáo và câu chuyện hấp dẫn trong vũ trụ Honkai Star Rail*\n\n' +
        '✨ Xem video để tìm hiểu thêm về nhân vật này!\n' +
        '🌟 Đừng quên like và subscribe để theo dõi thêm nội dung!'
      )
      .setImage(thumbnailURL)
      .addFields(
        { name: '� Game', value: 'Honkai Star Rail', inline: true },
        { name: '🎬 Loại', value: 'Character Video', inline: true },
        { name: '🏢 Nhà phát triển', value: 'HoYoverse', inline: true }
      )
      .setFooter({ 
        text: 'Honkai Star Rail - HoYoverse �',
        iconURL: 'https://yt3.googleusercontent.com/ytc/AIdro_mF-X7qVxGxQdVt5aQHxKvJ7ZqJxVQ_0JqXwLqB=s160-c-k-c0x00ffffff-no-rj'
      })
      .setTimestamp();

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setLabel('▶️ Xem video')
          .setURL(videoURL)
          .setStyle(ButtonStyle.Link),
        new ButtonBuilder()
          .setLabel('� Honkai Star Rail')
          .setURL('https://hsr.hoyoverse.com/')
          .setStyle(ButtonStyle.Link),
        new ButtonBuilder()
          .setLabel('� Tải game')
          .setURL('https://hsr.hoyoverse.com/download')
          .setStyle(ButtonStyle.Link)
      );

    await interaction.reply({ 
      content: `⭐ **${interaction.user}** đang xem thông tin về **Cyrene** trong Honkai Star Rail! �`,
      embeds: [embed], 
      components: [row] 
    });
  }
};
