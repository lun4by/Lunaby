const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const PrefixDB = require('../../services/database/PrefixDB');
const { DEFAULT_PREFIX } = require('../../config/constants');
const { COLORS } = require('../../utils/discord/embedUtils');
const { hasMemberPermission } = require('../../utils/discord/permissionUtils.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('prefix')
        .setDescription('Quản lý prefix của bot')
        .addSubcommand(sub =>
            sub.setName('view')
                .setDescription('Xem prefix hiện tại'))
        .addSubcommand(sub =>
            sub.setName('set')
                .setDescription('Đặt prefix cho server (cần quyền Manage Server)')
                .addStringOption(opt =>
                    opt.setName('prefix')
                        .setDescription('Prefix mới (tối đa 10 ký tự)')
                        .setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('user')
                .setDescription('Đặt prefix cá nhân (chỉ áp dụng cho bạn)')
                .addStringOption(opt =>
                    opt.setName('prefix')
                        .setDescription('Prefix cá nhân (tối đa 10 ký tự)')
                        .setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('reset')
                .setDescription('Reset prefix về mặc định')),

    prefix: { name: 'prefix', aliases: ['px'], description: 'Quản lý prefix' },
    cooldown: 10,

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'view': return await handleView(interaction);
            case 'set': return await handleSet(interaction);
            case 'user': return await handleUser(interaction);
            case 'reset': return await handleReset(interaction);
            default:
                return await handleView(interaction);
        }
    }
};

async function handleView(interaction) {
    const userId = interaction.user.id;
    const guildId = interaction.guild?.id;

    const userPrefix = await PrefixDB.getUserPrefix(userId);
    const serverPrefix = guildId ? await PrefixDB.getServerPrefix(guildId) : null;
    const activePrefix = await PrefixDB.resolvePrefix(userId, guildId);

    const notSet = interaction.t('commands.prefix.not_set');
    const embed = new EmbedBuilder()
        .setColor(COLORS.LUNABY)
        .setTitle(interaction.t('commands.prefix.title'))
        .addFields(
            { name: interaction.t('commands.prefix.default'), value: `\`${DEFAULT_PREFIX}\``, inline: true },
            { name: interaction.t('commands.prefix.server'), value: serverPrefix ? `\`${serverPrefix}\`` : notSet, inline: true },
            { name: interaction.t('commands.prefix.personal'), value: userPrefix ? `\`${userPrefix}\`` : notSet, inline: true },
            { name: interaction.t('commands.prefix.active'), value: `\`${activePrefix}\``, inline: false },
        )
        .setFooter({ text: interaction.t('commands.prefix.priority') });

    await interaction.reply({ embeds: [embed] });
}

async function handleSet(interaction) {
    if (interaction.guild && interaction.member) {
        if (!hasMemberPermission(interaction.member, PermissionFlagsBits.ManageGuild)) {
            return await interaction.reply({
                content: interaction.t('commands.prefix.need_manage_server'),
                ephemeral: true
            });
        }
    }

    if (!interaction.guild) {
        return await interaction.reply({
            content: interaction.t('commands.prefix.server_only'),
            ephemeral: true
        });
    }

    const newPrefix = interaction.options.getString('prefix');

    if (newPrefix.length > 10) {
        return await interaction.reply({
            content: interaction.t('commands.prefix.max_length'),
            ephemeral: true
        });
    }

    const success = await PrefixDB.setServerPrefix(interaction.guild.id, newPrefix);
    if (success) {
        await interaction.reply(interaction.t('commands.prefix.server_changed', { prefix: newPrefix }));
    } else {
        await interaction.reply({ content: interaction.t('commands.prefix.save_error'), ephemeral: true });
    }
}

async function handleUser(interaction) {
    const newPrefix = interaction.options.getString('prefix');

    if (newPrefix.length > 10) {
        return await interaction.reply({
            content: interaction.t('commands.prefix.max_length'),
            ephemeral: true
        });
    }

    const success = await PrefixDB.setUserPrefix(interaction.user.id, newPrefix);
    if (success) {
        await interaction.reply(interaction.t('commands.prefix.personal_changed', { prefix: newPrefix }));
    } else {
        await interaction.reply({ content: interaction.t('commands.prefix.save_error'), ephemeral: true });
    }
}

async function handleReset(interaction) {
    const userId = interaction.user.id;
    const guildId = interaction.guild?.id;

    await PrefixDB.removeUserPrefix(userId);
    if (guildId && hasMemberPermission(interaction.member, PermissionFlagsBits.ManageGuild)) {
        await PrefixDB.removeServerPrefix(guildId);
        await interaction.reply(interaction.t('commands.prefix.reset_all', { prefix: DEFAULT_PREFIX }));
    } else {
        await interaction.reply(interaction.t('commands.prefix.reset_personal', { prefix: DEFAULT_PREFIX }));
    }
}
