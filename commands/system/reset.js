const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const OWNER_ID = process.env.OWNER_ID;

const WARNINGS = {
  database: `**XÁC NHẬN RESET DATABASE**\n\n` +
    `Bạn có chắc chắn muốn xóa và tạo lại toàn bộ cơ sở dữ liệu không?\n\n` +
    `**Cảnh báo:**\n` +
    `> Tất cả dữ liệu sẽ bị xóa vĩnh viễn\n` +
    `> Không thể khôi phục sau khi reset\n` +
    `> Bot sẽ mất tất cả cuộc trò chuyện trước đây\n` +
    `> Conversations, settings sẽ bị xóa\n\n` +
    `**Hành động này không thể hoàn tác!**`,
  users: `**XÁC NHẬN RESET USER PROFILES**\n\n` +
    `Bạn có chắc chắn muốn xóa tất cả user profiles không?\n\n` +
    `**Cảnh báo:**\n` +
    `> Tất cả user profiles sẽ bị xóa vĩnh viễn\n` +
    `> Không thể khôi phục sau khi reset\n` +
    `> Tất cả XP, level, achievements sẽ mất\n` +
    `> Users sẽ phải đồng ý consent lại\n\n` +
    `**Hành động này không thể hoàn tác!**`,
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reset')
    .setDescription('Xóa và reset cơ sở dữ liệu (chỉ dành cho owner)')
    .addStringOption(opt => opt.setName('type').setDescription('Reset mode').setRequired(true)
      .addChoices(
        { name: 'Database (Conversations & All Data)', value: 'database' },
        { name: 'User Profiles (XP, Level, Achievements)', value: 'users' }
      )),

  async execute(interaction) {
    if (interaction.user.id !== OWNER_ID) {
      return interaction.reply({ content: 'Bạn không có quyền sử dụng lệnh này!', ephemeral: true });
    }

    const type = interaction.options.getString('type');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`reset_${type}_confirm`).setLabel('Đồng ý').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`reset_${type}_cancel`).setLabel('Từ chối').setStyle(ButtonStyle.Danger),
    );

    await interaction.reply({ content: WARNINGS[type], components: [row], ephemeral: true });
  },
};