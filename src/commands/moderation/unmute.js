const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const ConversationService = require('../../services/ai/ConversationService.js');
const { logModAction } = require('../../utils/modUtils.js');
const { sendModLog, createModActionEmbed } = require('../../utils/modLogUtils.js');
const logger = require('../../utils/logger.js');
const prompts = require('../../config/prompts.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Unmute (bỏ timeout) một thành viên')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Thành viên cần unmute')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Lý do unmute')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    prefix: { name: 'unmute', aliases: ['bỏ cấm'], description: 'Bỏ cấm người dùng' },
    cooldown: 5,

    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return interaction.reply({
                content: '❌ Bạn không có quyền sử dụng lệnh này!',
                ephemeral: true
            });
        }

        const targetUser = interaction.options.getUser('user');
        const targetMember = interaction.options.getMember('user');
        const reason = interaction.options.getString('reason') || 'Không có lý do được cung cấp';

        if (!targetUser) {
            const PrefixDB = require('../../services/database/PrefixDB');
            const prefix = await PrefixDB.resolvePrefix(interaction.user?.id, interaction.guild?.id);
            return (interaction.message || interaction).reply({ content: `Cách dùng:\n- Gỡ cấm ngôn (unmute): \`${prefix}unmute @user [lý do]\`` });
        }

        if (!targetMember) {
            return interaction.reply({
                content: '❌ Không tìm thấy thành viên này trong server!',
                ephemeral: true
            });
        }

        if (!targetMember.moderatable) {
            return interaction.reply({
                content: '❌ Không thể thực hiện hành động này do người dùng có quyền bảo vệ cao hơn!',
                ephemeral: true
            });
        }

        if (!targetMember.communicationDisabledUntil) {
            return interaction.reply({
                content: '❌ Người dùng này hiện không bị cấm ngôn!',
                ephemeral: true
            });
        }

        await interaction.deferReply();

        try {
            const prompt = prompts.moderation.unmute
                .replace('${username}', targetUser.username)
                .replace('${reason}', reason);

            const aiResponse = await ConversationService.getCompletion(prompt);

            const unmuteEmbed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle(`🔊 Đã gỡ cấm ngôn (Unmute)`)
                .setDescription(aiResponse)
                .addFields(
                    { name: '👤 Người dùng', value: `${targetUser.tag}`, inline: true },
                    { name: '🆔 ID', value: targetUser.id, inline: true },
                    { name: '📝 Lý do', value: reason, inline: false },
                    { name: '👮 Người xử lý', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '📅 Thời gian', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                )
                .setFooter({ text: `Được thực hiện bởi ${interaction.user.tag}` })
                .setTimestamp();

            await targetMember.timeout(null, reason);

            await logModAction({
                guildId: interaction.guild.id,
                targetId: targetUser.id,
                moderatorId: interaction.user.id,
                action: 'unmute',
                reason: reason
            });

            await interaction.editReply({ embeds: [unmuteEmbed] });

            const logEmbed = createModActionEmbed({
                title: `🔊 Đã gỡ cấm ngôn (Unmute)`,
                description: `Đã gỡ cấm ngôn ${targetUser.tag}.`,
                color: 0x00ff00,
                fields: [
                    { name: '👤 Người dùng', value: `${targetUser.tag} (<@${targetUser.id}>)`, inline: true },
                    { name: '🆔 ID', value: targetUser.id, inline: true },
                    { name: '👮 Người xử lý', value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: true },
                    { name: '📝 Lý do', value: reason, inline: false },
                    { name: '📅 Thời gian', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
                ],
                footer: `Server: ${interaction.guild.name}`
            });

            await sendModLog(interaction.guild, logEmbed, true);

            try {
                const dmEmbed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle(`Bạn đã được unmute trong ${interaction.guild.name}`)
                    .setDescription(`**Lý do:** ${reason}\n\nBạn đã có thể gửi tin nhắn và tham gia voice chat trở lại.`)
                    .setTimestamp();

                await targetUser.send({ embeds: [dmEmbed] });
            } catch (error) {
                logger.error('MODERATION', `Không thể gửi DM cho ${targetUser.tag}`);
            }

        } catch (error) {
            logger.error('MODERATION', 'Lỗi khi unmute thành viên:', error);
            await interaction.editReply({
                content: `❌ Đã xảy ra lỗi khi gỡ cấm ngôn người dùng: ${error.message}`,
                ephemeral: true
            });
        }
    },
};