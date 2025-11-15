const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const storageDB = require('../../services/storagedb.js');
const logger = require('../../utils/logger.js');
require('dotenv').config();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reset')
    .setDescription('Xóa và reset cơ sở dữ liệu (chỉ dành cho owner)')
    .addStringOption(option =>
      option
        .setName('type')
        .setDescription('Reset mode')
        .setRequired(true)
        .addChoices(
          { name: 'Database (Conversations & All Data)', value: 'database' },
          { name: 'User Profiles (XP, Level, Achievements)', value: 'users' }
        )
    ),

  async execute(interaction) {
    const ownerId = process.env.OWNER_ID;
    if (interaction.user.id !== ownerId) {
      return interaction.reply({ 
        content: 'Bạn không có quyền sử dụng lệnh này!', 
        ephemeral: true 
      });
    }

    const resetType = interaction.options.getString('type');
    
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`reset_${resetType}_confirm`)
          .setLabel('Đồng ý')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`reset_${resetType}_cancel`)
          .setLabel('Từ chối')
          .setStyle(ButtonStyle.Danger),
      );

    let warningMessage = '';
    
    if (resetType === 'database') {
      warningMessage = `⚠️ **XÁC NHẬN RESET DATABASE** ⚠️\n\n` +
                      `Bạn có chắc chắn muốn xóa và tạo lại toàn bộ cơ sở dữ liệu không?\n\n` +
                      `**Cảnh báo:**\n` +
                      `> Tất cả dữ liệu sẽ bị xóa vĩnh viễn\n` +
                      `> Không thể khôi phục sau khi reset\n` +
                      `> Bot sẽ mất tất cả cuộc trò chuyện trước đây\n` +
                      `> Conversations, settings sẽ bị xóa\n\n` +
                      `**Hành động này không thể hoàn tác!**`;
    } else if (resetType === 'users') {
      warningMessage = `⚠️ **XÁC NHẬN RESET USER PROFILES** ⚠️\n\n` +
                      `Bạn có chắc chắn muốn xóa tất cả user profiles không?\n\n` +
                      `**Cảnh báo:**\n` +
                      `> Tất cả user profiles sẽ bị xóa vĩnh viễn\n` +
                      `> Không thể khôi phục sau khi reset\n` +
                      `> Tất cả XP, level, achievements sẽ mất\n` +
                      `> Users sẽ phải đồng ý consent lại\n\n` +
                      `**Hành động này không thể hoàn tác!**`;
    }

    await interaction.reply({
      content: warningMessage,
      components: [row],
      ephemeral: true
    });
  },
};
