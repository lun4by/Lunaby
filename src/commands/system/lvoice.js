const {SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags} = require('discord.js');
const MariaModDB = require('../../services/database/MariaModDB.js');
const { creatorChannels } = require('../../events/voiceStateUpdate.js');
const emojis = require('../../config/emojis.js');
const logger = require('../../utils/core/logger.js');
const { COLORS } = require('../../utils/discord/embedUtils.js');
const { formatPermissionList, getMissingPermissions, hasMemberPermission, isMissingPermissionError } = require('../../utils/discord/permissionUtils.js');

const { createEmbed } = require('../../utils/discord/builderFactory');
const requiredBotPermissions = [PermissionFlagsBits.ManageChannels];

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
        if (!hasMemberPermission(interaction.member, PermissionFlagsBits.ManageChannels)) {
            return interaction.reply({
                content: `${emojis.error} ${interaction.t('commands.lvoice.need_perm')}`,
                flags: MessageFlags.Ephemeral,
            });
        }

        // Hỗ trợ cả slash và prefix
        let subcommand;
        try {
            subcommand = interaction.options.getSubcommand();
        } catch {
            subcommand = null;
        }

        // Fallback cho prefix: lấy args[0] làm subcommand
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
                content: `${emojis.error} ${interaction.t('commands.lvoice.invalid_subcmd')}`,
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};

async function handleSetup(interaction) {
    const missingPermissions = getMissingPermissions(interaction.guild?.members.me?.permissions, requiredBotPermissions);
    if (missingPermissions.length > 0) {
        return interaction.reply({
            content: `${emojis.error} ${interaction.t('commands.lvoice.bot_missing_perm_detail', { permissions: formatPermissionList(missingPermissions) })}`,
            flags: MessageFlags.Ephemeral,
        });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guild = interaction.guild;
    const categoryName = interaction.options.getString('name')
        || (interaction.args?.length > 1 ? interaction.args.slice(1).join(' ') : null)
        || 'Tạo Phòng Riêng';

    // Kiểm tra xem đã thiết lập chưa
    const existing = await MariaModDB.getLVoiceConfig(guild.id);
    if (existing) {
        return interaction.editReply({
            content: `${emojis.error} ${interaction.t('commands.lvoice.already_setup')}`,
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
            name: `${emojis.lvoice.createChannel} Tạo Kênh Voice`,
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

        const embed = createEmbed()
            .setColor(COLORS.LUNABY)
            .setTitle(interaction.t('commands.lvoice.setup_title'))
            .setDescription(interaction.t('commands.lvoice.setup_desc', { creatorId: creatorChannel.id }))
            .addFields(
                { name: interaction.t('commands.lvoice.category_field'), value: categoryName, inline: true },
                { name: interaction.t('commands.lvoice.creator_field'), value: `<#${creatorChannel.id}>`, inline: true },
                { name: interaction.t('commands.lvoice.template_field'), value: '`{user}`', inline: true },
            )
            .setFooter({ text: interaction.t('commands.lvoice.setup_footer') })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        logger.info('lvoice', `Setup completed in ${guild.name} by ${interaction.user.tag}`);
    } catch (error) {
        logger.error('lvoice', 'Error during setup:', error);
        if (isMissingPermissionError(error)) {
            const missingPermissions = getMissingPermissions(interaction.guild?.members.me?.permissions, requiredBotPermissions);
            if (missingPermissions.length > 0) {
                return interaction.editReply({
                    content: `${emojis.error} ${interaction.t('commands.lvoice.bot_missing_perm_detail', { permissions: formatPermissionList(missingPermissions) })}`,
                });
            }
        }

        await interaction.editReply({
            content: `${emojis.error} ${interaction.t('commands.lvoice.setup_error', { error: error.message })}`,
        });
    }
}

async function handleDisable(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guild = interaction.guild;
    const config = await MariaModDB.getLVoiceConfig(guild.id);

    if (!config) {
        return interaction.editReply({
            content: `${emojis.error} ${interaction.t('commands.lvoice.not_setup')}`,
        });
    }

    try {
        // Xóa kênh creator
        try {
            const creatorChannel = await guild.channels.fetch(config.creatorChannelId);
            if (creatorChannel) await creatorChannel.delete('LVoice disabled');
        } catch (e) { /* channel có thể đã bị xóa trước đó */ }

        // Xóa category (nếu trống)
        try {
            const category = await guild.channels.fetch(config.categoryId);
            if (category && category.children.cache.size === 0) {
                await category.delete('LVoice disabled');
            }
        } catch (e) { /* category có thể đã bị xóa trước đó */ }

        // Xóa cache
        creatorChannels.delete(config.creatorChannelId);

        // Xóa DB
        await MariaModDB.deleteLVoiceConfig(guild.id);

        await interaction.editReply({
            content: `${emojis.success} ${interaction.t('commands.lvoice.disable_success')}`,
        });

        logger.info('lvoice', `Disabled in ${guild.name} by ${interaction.user.tag}`);
    } catch (error) {
        logger.error('lvoice', 'Error during disable:', error);
        if (isMissingPermissionError(error)) {
            const missingPermissions = getMissingPermissions(interaction.guild?.members.me?.permissions, requiredBotPermissions);
            if (missingPermissions.length > 0) {
                return interaction.editReply({
                    content: `${emojis.error} ${interaction.t('commands.lvoice.bot_missing_perm_detail', { permissions: formatPermissionList(missingPermissions) })}`,
                });
            }
        }

        await interaction.editReply({
            content: `${emojis.error} ${interaction.t('commands.lvoice.disable_error', { error: error.message })}`,
        });
    }
}

async function handleConfig(interaction) {
    const guild = interaction.guild;
    const config = await MariaModDB.getLVoiceConfig(guild.id);

    if (!config) {
        return interaction.reply({
            content: `${emojis.error} ${interaction.t('commands.lvoice.not_setup')}`,
            flags: MessageFlags.Ephemeral,
        });
    }

    const embed = createEmbed()
        .setColor(COLORS.LUNABY)
        .setTitle(interaction.t('commands.lvoice.config_title'))
        .addFields(
            { name: interaction.t('commands.lvoice.creator_field'), value: `<#${config.creatorChannelId}>`, inline: true },
            { name: interaction.t('commands.lvoice.category_field'), value: `<#${config.categoryId}>`, inline: true },
            { name: interaction.t('commands.lvoice.template_field'), value: `\`${config.defaultName}\``, inline: true },
            { name: interaction.t('commands.lvoice.limit_field'), value: config.defaultLimit === 0 ? interaction.t('commands.lvoice.no_limit') : `${config.defaultLimit}`, inline: true },
            { name: interaction.t('commands.lvoice.bitrate_field'), value: `${config.defaultBitrate / 1000}kbps`, inline: true },
        )
        .setFooter({ text: 'Made by s4ory' })
        .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
