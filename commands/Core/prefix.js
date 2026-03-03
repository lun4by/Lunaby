const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const PrefixDB = require('../../services/database/PrefixDB');
const { DEFAULT_PREFIX } = require('../../config/constants');

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

    const embed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle('🔧 Cấu hình Prefix')
        .addFields(
            { name: 'Prefix mặc định', value: `\`${DEFAULT_PREFIX}\``, inline: true },
            { name: 'Prefix server', value: serverPrefix ? `\`${serverPrefix}\`` : '*Chưa đặt*', inline: true },
            { name: 'Prefix cá nhân', value: userPrefix ? `\`${userPrefix}\`` : '*Chưa đặt*', inline: true },
            { name: 'Đang sử dụng', value: `\`${activePrefix}\``, inline: false },
        )
        .setFooter({ text: 'Ưu tiên: Cá nhân > Server > Mặc định' });

    await interaction.reply({ embeds: [embed] });
}

async function handleSet(interaction) {
    if (interaction.guild && interaction.member) {
        const hasPermission = interaction.member.permissions?.has?.(PermissionFlagsBits.ManageGuild);
        if (!hasPermission) {
            return await interaction.reply({
                content: 'Bạn cần quyền **Manage Server** để đổi prefix server!',
                ephemeral: true
            });
        }
    }

    if (!interaction.guild) {
        return await interaction.reply({
            content: 'Lệnh này chỉ dùng được trong server! Dùng `/prefix user` để đặt prefix cá nhân.',
            ephemeral: true
        });
    }

    const newPrefix = interaction.options.getString('prefix');

    if (newPrefix.length > 10) {
        return await interaction.reply({
            content: 'Prefix không được dài quá 10 ký tự!',
            ephemeral: true
        });
    }

    const success = await PrefixDB.setServerPrefix(interaction.guild.id, newPrefix);
    if (success) {
        await interaction.reply(`Prefix server đã được đổi thành \`${newPrefix}\``);
    } else {
        await interaction.reply({ content: 'Không thể lưu prefix. Vui lòng thử lại sau.', ephemeral: true });
    }
}

async function handleUser(interaction) {
    const newPrefix = interaction.options.getString('prefix');

    if (newPrefix.length > 10) {
        return await interaction.reply({
            content: 'Prefix không được dài quá 10 ký tự!',
            ephemeral: true
        });
    }

    const success = await PrefixDB.setUserPrefix(interaction.user.id, newPrefix);
    if (success) {
        await interaction.reply(`Prefix cá nhân của bạn đã được đổi thành \`${newPrefix}\``);
    } else {
        await interaction.reply({ content: 'Không thể lưu prefix. Vui lòng thử lại sau.', ephemeral: true });
    }
}

async function handleReset(interaction) {
    const userId = interaction.user.id;
    const guildId = interaction.guild?.id;

    await PrefixDB.removeUserPrefix(userId);
    if (guildId && interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild)) {
        await PrefixDB.removeServerPrefix(guildId);
        await interaction.reply(`Đã reset prefix server và cá nhân về mặc định \`${DEFAULT_PREFIX}\``);
    } else {
        await interaction.reply(`Đã reset prefix cá nhân về mặc định \`${DEFAULT_PREFIX}\``);
    }
}