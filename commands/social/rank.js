const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const ProfileDB = require('./../../services/profiledb');
const XPService = require('./../../services/XPService');
const generateRankCard = require('./../../services/canvas/rankCanvas.js');
const { ordinalize } = require('./../../utils/string.js');

module.exports = {
  disabled: true,
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Hiển thị rank, level và XP của người dùng')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Người dùng cần xem rank')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const targetUser = interaction.options.getUser('user') || interaction.user;
    const member = await interaction.guild.members.fetch(targetUser.id);

    try {
      // Lấy profile từ profiledb
      const profile = await ProfileDB.getProfile(targetUser.id);
      const serverXP = profile.data.xp.find(x => x.id === interaction.guild.id);

      // Nếu chưa có XP data cho guild này
      if (!serverXP || serverXP.xp === 0) {
        const embed = new EmbedBuilder()
          .setColor('#FF0000')
          .setDescription(`${targetUser} chưa có điểm kinh nghiệm nào trong server này!`);
        return interaction.editReply({ embeds: [embed] });
      }

      const level = serverXP.level;
      const xp = serverXP.xp;
      const mlvlcap = 150 * (level * 2);
      const maxXPThisLevel = XPService.calculateMaxLevelXP(level);
      const curXPThisLevel = XPService.calculateCurrentLevelXP(xp, level);
      const percentage = Math.round((curXPThisLevel / maxXPThisLevel) * 100);

      // Lấy rank của user
      const userRank = await XPService.getUserRank(interaction.guild.id, targetUser.id);
      const rank = ordinalize(userRank);

      // Wreath cho top players
      const wreaths = [
        'https://i.imgur.com/xsZHQcW.png', // 1st
        'https://i.imgur.com/NmpP8oU.png', // 2nd
        'https://i.imgur.com/bzhoYpa.png', // 3rd
        'https://i.imgur.com/NSEbnek.png'  // 4-10
      ];

      let wreath = null;
      const indexer = userRank - 1;
      if (indexer < 3) {
        wreath = wreaths[indexer];
      } else if (indexer < 10) {
        wreath = wreaths[3];
      }

      // Tạo rank card
      const attachment = await generateRankCard(
        member,
        targetUser,
        level,
        xp,
        mlvlcap,
        maxXPThisLevel,
        curXPThisLevel,
        percentage,
        rank,
        wreath
      );

      await interaction.editReply({ files: [attachment] });
    } catch (error) {
      console.error('Error in rank command:', error);
      await interaction.editReply({ content: 'Đã xảy ra lỗi khi tạo rank card!', ephemeral: true });
    }
  }
};
