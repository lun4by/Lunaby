const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const MemoryService = require('../../services/MemoryService.js');
const logger = require('../../utils/logger.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('memory')
    .setDescription('Xem và quản lý trí nhớ AI của bạn')
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('Xem tóm tắt trí nhớ của bạn')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Thêm một trí nhớ mới')
        .addStringOption(option =>
          option
            .setName('content')
            .setDescription('Nội dung trí nhớ')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('category')
            .setDescription('Loại trí nhớ')
            .setRequired(false)
            .addChoices(
              { name: 'Sở thích', value: 'preference' },
              { name: 'Sự kiện', value: 'event' },
              { name: 'Thông tin', value: 'fact' },
              { name: 'Thành tựu', value: 'achievement' }
            )
        )
        .addIntegerOption(option =>
          option
            .setName('importance')
            .setDescription('Độ quan trọng (1-10)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(10)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('clear')
        .setDescription('Xóa toàn bộ trí nhớ của bạn')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('privacy')
        .setDescription('Cài đặt quyền riêng tư')
        .addBooleanOption(option =>
          option
            .setName('allow_memory')
            .setDescription('Cho phép lưu trữ trí nhớ')
            .setRequired(false)
        )
        .addBooleanOption(option =>
          option
            .setName('allow_extraction')
            .setDescription('Cho phép trích xuất thông tin tự động')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('update')
        .setDescription('Cập nhật thông tin cá nhân')
        .addStringOption(option =>
          option
            .setName('name')
            .setDescription('Tên của bạn')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('nickname')
            .setDescription('Nickname')
            .setRequired(false)
        )
        .addIntegerOption(option =>
          option
            .setName('age')
            .setDescription('Tuổi')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('location')
            .setDescription('Vị trí')
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    try {
      const subcommand = interaction.options.getSubcommand();
      const userId = interaction.guildId 
        ? `${interaction.guildId}-${interaction.user.id}`
        : `DM-${interaction.user.id}`;

      switch (subcommand) {
        case 'view':
          await this.handleView(interaction, userId);
          break;
        case 'add':
          await this.handleAdd(interaction, userId);
          break;
        case 'clear':
          await this.handleClear(interaction, userId);
          break;
        case 'privacy':
          await this.handlePrivacy(interaction, userId);
          break;
        case 'update':
          await this.handleUpdate(interaction, userId);
          break;
        default:
          await interaction.reply({
            content: 'Lệnh không hợp lệ.',
            ephemeral: true
          });
      }
    } catch (error) {
      logger.error('MEMORY_COMMAND', 'Error executing memory command:', error);
      
      const errorMessage = 'Đã xảy ra lỗi khi xử lý lệnh trí nhớ. Vui lòng thử lại sau.';
      
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    }
  },

  async handleView(interaction, userId) {
    await interaction.deferReply({ ephemeral: true });

    const summary = await MemoryService.getMemorySummary(userId);

    if (!summary) {
      await interaction.editReply('Không thể lấy thông tin trí nhớ. Vui lòng thử lại sau.');
      return;
    }

    const embed = new EmbedBuilder()
      .setColor('#7289DA')
      .setTitle('🧠 Trí Nhớ AI của bạn')
      .setDescription('Đây là những gì Lunaby nhớ về bạn:')
      .setTimestamp();

    // Personal Info
    const personalInfo = [];
    if (summary.personalInfo.name) personalInfo.push(`**Tên:** ${summary.personalInfo.name}`);
    if (summary.personalInfo.nickname) personalInfo.push(`**Nickname:** ${summary.personalInfo.nickname}`);
    if (summary.personalInfo.age) personalInfo.push(`**Tuổi:** ${summary.personalInfo.age}`);
    if (summary.personalInfo.location) personalInfo.push(`**Vị trí:** ${summary.personalInfo.location}`);
    
    if (personalInfo.length > 0) {
      embed.addFields({
        name: '👤 Thông tin cá nhân',
        value: personalInfo.join('\n'),
        inline: false
      });
    }

    // Preferences
    const preferences = [];
    if (summary.preferences.likes.length > 0) {
      preferences.push(`**Thích:** ${summary.preferences.likes.slice(0, 5).join(', ')}`);
    }
    if (summary.preferences.hobbies.length > 0) {
      preferences.push(`**Sở thích:** ${summary.preferences.hobbies.slice(0, 5).join(', ')}`);
    }
    if (summary.preferences.topics.length > 0) {
      preferences.push(`**Chủ đề yêu thích:** ${summary.preferences.topics.slice(0, 5).join(', ')}`);
    }

    if (preferences.length > 0) {
      embed.addFields({
        name: '❤️ Sở thích',
        value: preferences.join('\n'),
        inline: false
      });
    }

    // Important Memories
    if (summary.importantMemories.length > 0) {
      const memoryList = summary.importantMemories
        .slice(0, 5)
        .map((mem, idx) => `${idx + 1}. ${mem.content} (⭐ ${mem.importance}/10)`)
        .join('\n');
      
      embed.addFields({
        name: '💭 Trí nhớ quan trọng',
        value: memoryList,
        inline: false
      });
    }

    // Stats
    const stats = [
      `**Tổng số trí nhớ:** ${summary.totalMemories}`,
      `**Tổng tin nhắn:** ${summary.interactionStats.totalMessages}`,
      `**Lần tương tác đầu:** <t:${Math.floor(new Date(summary.interactionStats.firstInteraction).getTime() / 1000)}:R>`
    ];

    embed.addFields({
      name: '📊 Thống kê',
      value: stats.join('\n'),
      inline: false
    });

    await interaction.editReply({ embeds: [embed] });
  },

  async handleAdd(interaction, userId) {
    const content = interaction.options.getString('content');
    const category = interaction.options.getString('category') || 'fact';
    const importance = interaction.options.getInteger('importance') || 5;

    await interaction.deferReply({ ephemeral: true });

    const success = await MemoryService.addMemory(userId, {
      content: content,
      category: category,
      importance: importance,
      source: 'manual'
    });

    if (success) {
      const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('✅ Đã thêm trí nhớ')
        .setDescription(`**Nội dung:** ${content}\n**Loại:** ${category}\n**Độ quan trọng:** ${importance}/10`)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.editReply('Không thể thêm trí nhớ. Có thể bạn đã tắt chức năng lưu trữ trí nhớ.');
    }
  },

  async handleClear(interaction, userId) {
    await interaction.deferReply({ ephemeral: true });

    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('⚠️ Xác nhận xóa trí nhớ')
      .setDescription('Bạn có chắc chắn muốn xóa **toàn bộ** trí nhớ của mình?\n\nHành động này không thể hoàn tác!')
      .setTimestamp();

    await interaction.editReply({
      embeds: [embed],
      components: [{
        type: 1,
        components: [
          {
            type: 2,
            style: 4,
            label: 'Xóa toàn bộ',
            custom_id: `memory_clear_confirm_${userId}`
          },
          {
            type: 2,
            style: 2,
            label: 'Hủy',
            custom_id: `memory_clear_cancel_${userId}`
          }
        ]
      }]
    });

    // Wait for button interaction
    const filter = (i) => {
      return i.user.id === interaction.user.id && 
             (i.customId === `memory_clear_confirm_${userId}` || 
              i.customId === `memory_clear_cancel_${userId}`);
    };

    try {
      const buttonInteraction = await interaction.channel.awaitMessageComponent({
        filter,
        time: 30000
      });

      if (buttonInteraction.customId === `memory_clear_confirm_${userId}`) {
        const success = await MemoryService.clearUserMemories(userId);
        
        if (success) {
          await buttonInteraction.update({
            embeds: [
              new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Đã xóa trí nhớ')
                .setDescription('Toàn bộ trí nhớ của bạn đã được xóa.')
                .setTimestamp()
            ],
            components: []
          });
        } else {
          await buttonInteraction.update({
            content: 'Không thể xóa trí nhớ. Vui lòng thử lại sau.',
            embeds: [],
            components: []
          });
        }
      } else {
        await buttonInteraction.update({
          embeds: [
            new EmbedBuilder()
              .setColor('#FFA500')
              .setTitle('❌ Đã hủy')
              .setDescription('Trí nhớ của bạn vẫn được giữ nguyên.')
              .setTimestamp()
          ],
          components: []
        });
      }
    } catch (error) {
      await interaction.editReply({
        content: 'Hết thời gian chờ. Trí nhớ của bạn vẫn được giữ nguyên.',
        embeds: [],
        components: []
      });
    }
  },

  async handlePrivacy(interaction, userId) {
    const allowMemory = interaction.options.getBoolean('allow_memory');
    const allowExtraction = interaction.options.getBoolean('allow_extraction');

    await interaction.deferReply({ ephemeral: true });

    const privacySettings = {};
    if (allowMemory !== null) privacySettings.allowMemoryStorage = allowMemory;
    if (allowExtraction !== null) privacySettings.allowPersonalInfoExtraction = allowExtraction;

    if (Object.keys(privacySettings).length === 0) {
      await interaction.editReply('Vui lòng chọn ít nhất một cài đặt quyền riêng tư để cập nhật.');
      return;
    }

    const success = await MemoryService.updatePrivacySettings(userId, privacySettings);

    if (success) {
      const settings = [];
      if (allowMemory !== null) {
        settings.push(`**Lưu trữ trí nhớ:** ${allowMemory ? '✅ Bật' : '❌ Tắt'}`);
      }
      if (allowExtraction !== null) {
        settings.push(`**Trích xuất tự động:** ${allowExtraction ? '✅ Bật' : '❌ Tắt'}`);
      }

      const embed = new EmbedBuilder()
        .setColor('#7289DA')
        .setTitle('🔒 Đã cập nhật quyền riêng tư')
        .setDescription(settings.join('\n'))
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.editReply('Không thể cập nhật cài đặt quyền riêng tư. Vui lòng thử lại sau.');
    }
  },

  async handleUpdate(interaction, userId) {
    const name = interaction.options.getString('name');
    const nickname = interaction.options.getString('nickname');
    const age = interaction.options.getInteger('age');
    const location = interaction.options.getString('location');

    await interaction.deferReply({ ephemeral: true });

    const updates = {};
    if (name) updates['personalInfo.name'] = name;
    if (nickname) updates['personalInfo.nickname'] = nickname;
    if (age) updates['personalInfo.age'] = age;
    if (location) updates['personalInfo.location'] = location;

    if (Object.keys(updates).length === 0) {
      await interaction.editReply('Vui lòng chọn ít nhất một thông tin để cập nhật.');
      return;
    }

    const success = await MemoryService.updateUserMemory(userId, updates);

    if (success) {
      const updatedFields = [];
      if (name) updatedFields.push(`**Tên:** ${name}`);
      if (nickname) updatedFields.push(`**Nickname:** ${nickname}`);
      if (age) updatedFields.push(`**Tuổi:** ${age}`);
      if (location) updatedFields.push(`**Vị trí:** ${location}`);

      const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('✅ Đã cập nhật thông tin')
        .setDescription(updatedFields.join('\n'))
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.editReply('Không thể cập nhật thông tin. Vui lòng thử lại sau.');
    }
  }
};
