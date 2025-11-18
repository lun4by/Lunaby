const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  PermissionsBitField,
  ChannelType
} = require('discord.js');

const guildProfileDB = require('../../services/guildprofiledb');
const logger = require('../../utils/logger');

const profileCache = new Map();
const CACHE_TTL = 30000; 

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setting')
    .setDescription('Quản lý cài đặt bot (Server Manager)'),

  async execute(interaction) {
    return interaction.reply({ content: '🔧 Lệnh này đang được bảo trì. Vui lòng thử lại sau!', ephemeral: true });
    // Permission check
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      return interaction.reply({ 
        content: '❌ Bạn cần quyền **Manage Server** để sử dụng lệnh này.', 
        ephemeral: true 
      });
    }

    try {
      await interaction.deferReply({ ephemeral: true });

      const guildId = interaction.guildId;
      
      // Get profile with cache
      let profile = profileCache.get(guildId);
      if (!profile || Date.now() - profile.timestamp > CACHE_TTL) {
        profile = { 
          data: await guildProfileDB.getGuildProfile(guildId),
          timestamp: Date.now()
        };
        profileCache.set(guildId, profile);
      }

      // Initialize settings
      if (!profile.data.settings) {
        profile.data.settings = {
          levelUpNotifications: true,
          allowedCommandChannels: [],
          useEmbeds: true
        };
      }

      const settings = profile.data.settings;

      // Build UI
      const { embed, components } = buildSettingsUI(settings, interaction.guild);

      await interaction.editReply({ embeds: [embed], components });

      // Setup collector
      const message = await interaction.fetchReply();
      const collector = message.createMessageComponentCollector({ 
        filter: i => i.user.id === interaction.user.id,
        time: 600000 // 10 minutes
      });

      collector.on('collect', async (i) => {
        try {
          // Re-check permission
          if (!i.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return i.reply({ 
              content: '❌ Bạn cần quyền **Manage Server**.', 
              ephemeral: true 
            });
          }

          await handleInteraction(i, guildId, settings, interaction.guild);
          
          // Invalidate cache
          profileCache.delete(guildId);

        } catch (err) {
          logger.error('SETTING', `Error handling interaction: ${err.message}`);
          if (!i.replied && !i.deferred) {
            await i.reply({ content: '❌ Đã xảy ra lỗi. Vui lòng thử lại.', ephemeral: true });
          }
        }
      });

      collector.on('end', async (_, reason) => {
        try {
          if (reason === 'closed') return;

          const { components: disabledComponents } = buildSettingsUI(settings, interaction.guild, true);
          await interaction.editReply({ 
            content: '⏱️ Phiên cài đặt đã hết hạn (10 phút).', 
            components: disabledComponents 
          });
        } catch (err) {
          logger.error('SETTING', `Error disabling components: ${err.message}`);
        }
      });

    } catch (error) {
      logger.error('SETTING', `Execute error: ${error.message}`);
      const content = '❌ Không thể mở cài đặt. Vui lòng thử lại.';
      
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content, ephemeral: true });
      } else {
        await interaction.reply({ content, ephemeral: true });
      }
    }
  }
};

function buildSettingsUI(settings, guild, disabled = false) {
  const embed = new EmbedBuilder()
    .setTitle('⚙️ Cài Đặt Bot')
    .setColor(0x9B59B6)
    .setDescription('Điều chỉnh các cài đặt bot cho server của bạn.')
    .addFields(
      { 
        name: '🔔 Thông báo Level-up', 
        value: `[${settings.levelUpNotifications ? 'on' : 'off'}]`, 
        inline: true 
      },
      { 
        name: '📋 Sử dụng Embed', 
        value: `[${settings.useEmbeds ? 'on' : 'off'}]`, 
        inline: true 
      },
      { 
        name: '💬 Kênh cho phép lệnh', 
        value: getChannelListText(settings.allowedCommandChannels), 
        inline: false 
      }
    )
    .setFooter({ text: disabled ? 'Đã hết hạn' : 'Tự động đóng sau 10 phút' })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('set_toggle_level')
      .setLabel(settings.levelUpNotifications ? 'Tắt Level' : 'Bật Level')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('set_toggle_embed')
      .setLabel(settings.useEmbeds ? 'Tắt Embed' : 'Bật Embed')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('set_manage_channels')
      .setLabel('💬 Quản lý kênh')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('set_close')
      .setLabel('✖️ Đóng')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
  );

  return { embed, components: [row1, row2] };
}


async function handleInteraction(i, guildId, settings, guild) {
  const { customId } = i;

  if (customId === 'set_toggle_level') {
    settings.levelUpNotifications = !settings.levelUpNotifications;
    await guildProfileDB.updateGuildProfile(guildId, { 
      'settings.levelUpNotifications': settings.levelUpNotifications 
    });

    const { embed, components } = buildSettingsUI(settings, guild);
    await i.update({ embeds: [embed], components });
    
    logger.info('SETTING', `Level notifications: ${settings.levelUpNotifications} (${guildId})`);
    return;
  }

  if (customId === 'set_toggle_embed') {
    settings.useEmbeds = !settings.useEmbeds;
    await guildProfileDB.updateGuildProfile(guildId, { 
      'settings.useEmbeds': settings.useEmbeds 
    });

    const { embed, components } = buildSettingsUI(settings, guild);
    await i.update({ embeds: [embed], components });
    
    logger.info('SETTING', `Use embeds: ${settings.useEmbeds} (${guildId})`);
    return;
  }

  if (customId === 'set_manage_channels') {
    const textChannels = guild.channels.cache
      .filter(c => c.type === ChannelType.GuildText)
      .first(25);

    if (textChannels.length === 0) {
      return i.reply({ content: '❌ Không tìm thấy kênh văn bản nào.', ephemeral: true });
    }

    const select = new StringSelectMenuBuilder()
      .setCustomId('set_channel_select')
      .setPlaceholder('Chọn kênh (tối đa 25)')
      .setMinValues(0)
      .setMaxValues(Math.min(25, textChannels.length))
      .addOptions(
        textChannels.map(ch => ({
          label: `#${ch.name}`,
          value: ch.id,
          description: settings.allowedCommandChannels.includes(ch.id) ? '✅ Đã cho phép' : 'Chưa cho phép',
          default: settings.allowedCommandChannels.includes(ch.id)
        }))
      );

    const selectRow = new ActionRowBuilder().addComponents(select);
    const { embed, components } = buildSettingsUI(settings, guild);
    
    await i.update({ embeds: [embed], components: [...components, selectRow] });
    return;
  }

  if (customId === 'set_close') {
    await i.update({ 
      content: '✅ Cài đặt đã được đóng.', 
      embeds: [], 
      components: [] 
    });
    
    // Stop collector
    i.message.collector?.stop('closed');
    return;
  }

  if (customId === 'set_channel_select') {
    const selected = i.values;
    
    // Replace the entire list with selected channels
    settings.allowedCommandChannels = selected;
    
    await guildProfileDB.updateGuildProfile(guildId, { 
      'settings.allowedCommandChannels': settings.allowedCommandChannels 
    });

    const { embed, components } = buildSettingsUI(settings, guild);
    await i.update({ embeds: [embed], components });
    
    logger.info('SETTING', `Allowed channels updated (${guildId}): ${selected.join(',')}`);
    return;
  }
}


function getChannelListText(channels) {
  if (!channels || channels.length === 0) {
    return '🌐 Tất cả kênh';
  }
  
  if (channels.length <= 5) {
    return channels.map(id => `<#${id}>`).join(', ');
  }
  
  return `${channels.slice(0, 5).map(id => `<#${id}>`).join(', ')} +${channels.length - 5} kênh`;
}
