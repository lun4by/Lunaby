const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const MariaModDB = require('../../services/database/MariaModDB.js');
const logger = require('../../utils/logger.js');
const emojis = require('../../config/emojis.js');
const { sendModLog, createModActionEmbed } = require('../../utils/modLogUtils.js');
const { handlePermissionError } = require('../../utils/permissionUtils.js');
const prompts = require('../../config/prompts.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Đuổi một thành viên khỏi server')
        .addUserOption(option =>
            option.setName('user').setDescription('Thành viên cần đuổi').setRequired(true)
        )
        .addStringOption(option =>
            option.setName('reason').setDescription('Lý do đuổi').setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
    prefix: { name: 'kick', aliases: [], description: 'Kick thành viên ra khỏi server' },
    cooldown: 5,

    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
            return interaction.reply({
                content: `${emojis.error} Bạn không có quyền sử dụng lệnh này!`,
                ephemeral: true,
            });
        }

        const targetUser = interaction.options.getUser('user');
        const targetMember = interaction.options.getMember('user');

        if (!targetUser) {
            const PrefixDB = require('../../services/database/PrefixDB');
            const prefix = await PrefixDB.resolvePrefix(interaction.user?.id, interaction.guild?.id);
            return (interaction.message || interaction).reply({ content: `Cách dùng:\n- Đuổi thành viên (kick): \`${prefix}kick @user [lý do]\`` });
        }

        if (!targetMember) {
            return interaction.reply({
                content: `${emojis.error} Không tìm thấy thành viên này trong server!`,
                ephemeral: true,
            });
        }

        const reason = interaction.options.getString('reason')?.trim() || 'Không có lý do cụ thể';

        if (!targetMember.kickable) {
            return interaction.reply({
                content: `${emojis.error} Không thể thực hiện hành động này do người dùng có quyền bảo vệ cao hơn!`,
                ephemeral: true,
            });
        }

        await interaction.deferReply();

        try {
            const prompt = prompts.moderation.kick
                .replace('${username}', targetUser.username)
                .replace('${reason}', reason);

            const aiResponse = await ConversationService.getOneTimeCompletion(prompt);

            await targetMember.kick(reason);

            await logModAction({
                guildId: interaction.guild.id,
                targetId: targetUser.id,
                moderatorId: interaction.user.id,
                action: 'kick',
                reason,
            });

            await interaction.editReply({ content: aiResponse });

            const logEmbed = createModActionEmbed({
                title: '👢 Đã đuổi thành viên (Kick)',
                description: `Đã đuổi ${targetUser.tag} khỏi server.`,
                color: 0xffa500,
                fields: [
                    { name: '👤 Người dùng', value: targetUser.tag, inline: true },
                    { name: '🆔 ID', value: targetUser.id, inline: true },
                    { name: '👮 Người xử lý', value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: true },
                    { name: '📝 Lý do', value: reason, inline: false },
                    { name: '📅 Thời gian', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
                ],
                footer: `Server: ${interaction.guild.name}`,
            });

            await sendModLog(interaction.guild, logEmbed, true);
        } catch (error) {
            logger.error('MODERATION', `Lỗi khi kick ${targetUser.tag}: ${error.message}`);
            await interaction.editReply({
                content: `${emojis.error} Đã xảy ra lỗi khi đuổi người dùng: ${error.message}`,
                ephemeral: true
            });
        }
    },
};