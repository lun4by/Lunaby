const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');
const MariaModDB = require('../../services/database/MariaModDB.js');
const { creatorChannels } = require('../../events/voiceStateUpdate.js');
const emojis = require('../../config/emojis.js');
const logger = require('../../utils/logger.js');
const { COLORS } = require('../../utils/embedUtils.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lvoice')
        .setDescription('Quản lý hệ thống kênh voice tạm (LunabyVC)')
        .addSubcommand(sub =>
            sub.setName('setup')
                .setDescription('Thiết lập hệ thống tạo kênh voice tạm')
                .addStringOption(opt =>
                    opt.setName('name')
                        .setDescription('Tên category (mặc định: Tạo Phòng Riêng)')
                        .setRequired(false)))
        .addSubcommand(sub =>
            sub.setName('disable')
                .setDescription('Tắt và xóa hệ thống kênh voice tạm'))
        .addSubcommand(sub =>
            sub.setName('config')
                .setDescription('Xem cấu hình hiện tại'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    prefix: { name: 'lvoice', aliases: ['vm', 'vc'], description: 'Quản lý hệ thống voice tạm' },
    cooldown: 10,

    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return interaction.reply({
                content: `${emojis.error} Bạn cần quyền **Manage Channels** để sử dụng lệnh này!`,
                ephemeral: true,
            });
        }

        // Hỗ trợ cả slash và prefix
        let subcommand;
        try {
            subcommand = interaction.options.getSubcommand();
        } catch {
            subcommand = null;
        }

        // Prefix fallback: lấy args[0] làm subcommand
        if (!subcommand && interaction.args?.length > 0) {
            subcommand = interaction.args[0]?.toLowerCase();
        }

        if (subcommand === 'setup') {
            await handleSetup(interaction);
        } else if (subcommand === 'disable') {
            await handleDisable(interaction);
        } else if (subcommand === 'config') {
            await handleConfig(interaction);
        } else {
            return interaction.reply({
                content: `${emojis.error} Subcommand không hợp lệ! Dùng: \`/lvoice setup\`, \`/lvoice disable\`, \`/lvoice config\``,
                ephemeral: true,
            });
        }
    },
};

async function handleSetup(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;
    const categoryName = interaction.options.getString('name')
        || (interaction.args?.length > 1 ? interaction.args.slice(1).join(' ') : null)
        || 'Tạo Phòng Riêng';

    // Kiểm tra xem đã setup chưa
    const existing = await MariaModDB.getLVoiceConfig(guild.id);
    if (existing) {
        return interaction.editReply({
            content: `${emojis.error} LVoice đã được thiết lập rồi! Dùng \`/lvoice disable\` để tắt trước khi setup lại.`,
        });
    }

    try {
        // Tạo category
        const category = await guild.channels.create({
            name: categoryName,
            type: ChannelType.GuildCategory,
        });

        // Tạo kênh voice creator bên trong category
        const creatorChannel = await guild.channels.create({
            name: '➕ Tạo Kênh Voice',
            type: ChannelType.GuildVoice,
            parent: category.id,
        });

        // Lưu config vào DB
        const config = {
            creatorChannelId: creatorChannel.id,
            categoryId: category.id,
            defaultName: '{user}',
            defaultLimit: 0,
            defaultBitrate: 64000,
        };

        await MariaModDB.setLVoiceConfig(guild.id, config);

        // Cập nhật cache
        creatorChannels.set(creatorChannel.id, {
            guildId: guild.id,
            categoryId: category.id,
            defaultName: '{user}',
            defaultLimit: 0,
            defaultBitrate: 64000,
        });

        const embed = new EmbedBuilder()
            .setColor(COLORS.LUNABY)
            .setTitle('🎙️ LVoice đã được thiết lập!')
            .setDescription(`Thành viên có thể vào kênh <#${creatorChannel.id}> để tự tạo kênh voice riêng.`)
            .addFields(
                { name: '📁 Category', value: categoryName, inline: true },
                { name: '🔊 Kênh tạo', value: `<#${creatorChannel.id}>`, inline: true },
                { name: '📝 Template tên', value: '`{user}`', inline: true },
            )
            .setFooter({ text: 'Kênh sẽ tự xóa khi không còn ai bên trong.' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        logger.info('LVOICE', `Setup completed in ${guild.name} by ${interaction.user.tag}`);
    } catch (error) {
        logger.error('LVOICE', 'Error during setup:', error);
        await interaction.editReply({
            content: `${emojis.error} Đã xảy ra lỗi khi thiết lập LVoice: ${error.message}`,
        });
    }
}

async function handleDisable(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;
    const config = await MariaModDB.getLVoiceConfig(guild.id);

    if (!config) {
        return interaction.editReply({
            content: `${emojis.error} LVoice chưa được thiết lập trong server này!`,
        });
    }

    try {
        // Xóa kênh creator
        try {
            const creatorChannel = await guild.channels.fetch(config.creatorChannelId);
            if (creatorChannel) await creatorChannel.delete('LVoice disabled');
        } catch (e) { /* channel may already be deleted */ }

        // Xóa category (nếu trống)
        try {
            const category = await guild.channels.fetch(config.categoryId);
            if (category && category.children.cache.size === 0) {
                await category.delete('LVoice disabled');
            }
        } catch (e) { /* category may already be deleted */ }

        // Xóa cache
        creatorChannels.delete(config.creatorChannelId);

        // Xóa DB
        await MariaModDB.deleteLVoiceConfig(guild.id);

        await interaction.editReply({
            content: `${emojis.success} Đã tắt LVoice thành công!`,
        });

        logger.info('LVOICE', `Disabled in ${guild.name} by ${interaction.user.tag}`);
    } catch (error) {
        logger.error('LVOICE', 'Error during disable:', error);
        await interaction.editReply({
            content: `${emojis.error} Đã xảy ra lỗi khi tắt LVoice: ${error.message}`,
        });
    }
}

async function handleConfig(interaction) {
    const guild = interaction.guild;
    const config = await MariaModDB.getLVoiceConfig(guild.id);

    if (!config) {
        return interaction.reply({
            content: `${emojis.error} LVoice chưa được thiết lập! Dùng \`/lvoice setup\` để bắt đầu.`,
            ephemeral: true,
        });
    }

    const embed = new EmbedBuilder()
        .setColor(COLORS.LUNABY)
        .setTitle('🎙️ Cấu hình LVoice')
        .addFields(
            { name: '🔊 Kênh tạo', value: `<#${config.creatorChannelId}>`, inline: true },
            { name: '📁 Category', value: `<#${config.categoryId}>`, inline: true },
            { name: '📝 Template tên', value: `\`${config.defaultName}\``, inline: true },
            { name: '👥 Giới hạn người', value: config.defaultLimit === 0 ? 'Không giới hạn' : `${config.defaultLimit}`, inline: true },
            { name: '🔈 Bitrate', value: `${config.defaultBitrate / 1000}kbps`, inline: true },
        )
        .setFooter({ text: 'Made by s4ory' })
        .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
}
