const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const ConversationService = require('../../services/ai/ConversationService.js');
const { logModAction, formatDuration } = require('../../utils/modUtils.js');
const { sendModLog, createModActionEmbed } = require('../../utils/modLogUtils.js');
const { handlePermissionError } = require('../../utils/permissionUtils');
const logger = require('../../utils/logger.js');
const emojis = require('../../config/emojis.js');
const prompts = require('../../config/prompts.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Mute (timeout) một thành viên')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Thành viên cần mute')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('duration')
                .setDescription('Thời gian mute (phút)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(40320))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Lý do mute')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    prefix: { name: 'mute', aliases: ['cấm'], description: 'Cấm người dùng' },
    cooldown: 5,

    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return interaction.reply({
                content: `${emojis.error} Bạn không có quyền sử dụng lệnh này!`,
                ephemeral: true
            });
        }

        const targetUser = interaction.options.getUser('user');
        const targetMember = interaction.options.getMember('user');
        const duration = interaction.options.getInteger('duration'); // Thời gian tính bằng phút
        const reason = interaction.options.getString('reason') || 'Không có lý do được cung cấp';

        if (!targetUser || !duration) {
            const PrefixDB = require('../../services/database/PrefixDB');
            const prefix = await PrefixDB.resolvePrefix(interaction.user?.id, interaction.guild?.id);
            return (interaction.message || interaction).reply({ content: `Cách dùng:\n- Cấm ngôn (mute): \`${prefix}mute @user [số_phút] [lý do]\`` });
        }

        if (!targetMember) {
            return interaction.reply({
                content: `${emojis.error} Không tìm thấy thành viên này trong server!`,
                ephemeral: true
            });
        }

        if (!targetMember.moderatable) {
            return interaction.reply({
                content: `${emojis.error} Không thể thực hiện hành động này do người dùng có quyền bảo vệ cao hơn!`,
                ephemeral: true
            });
        }

        await interaction.deferReply();

        try {
            const durationMs = duration * 60 * 1000;

            const endTime = new Date(Date.now() + durationMs);

            const formattedDuration = formatDuration(duration);

            const prompt = prompts.moderation.mute
                .replace('${username}', targetUser.username)
                .replace('${duration}', formattedDuration)
                .replace('${reason}', reason);

            const aiResponse = await ConversationService.getOneTimeCompletion(prompt);

            await targetMember.timeout(durationMs, reason);

            await logModAction({
                guildId: interaction.guild.id,
                targetId: targetUser.id,
                moderatorId: interaction.user.id,
                action: 'mute',
                reason: reason,
                duration: duration
            });

            await interaction.editReply({ content: aiResponse });

            const logEmbed = createModActionEmbed({
                title: `🔇 Đã cấm ngôn (Mute)`,
                description: `Đã cấm ngôn ${targetUser.tag}.`,
                color: 0xffff00,
                fields: [
                    { name: '👤 Người dùng', value: `${targetUser.tag} (<@${targetUser.id}>)`, inline: true },
                    { name: '🆔 ID', value: targetUser.id, inline: true },
                    { name: '👮 Người xử lý', value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: true },
                    { name: '⏳ Thời gian phạt', value: formattedDuration, inline: true },
                    { name: '📅 Kết thúc lúc', value: `<t:${Math.floor(endTime.getTime() / 1000)}:F>`, inline: true },
                    { name: '📝 Lý do', value: reason, inline: false }
                ],
                footer: `Server: ${interaction.guild.name}`
            });

            await sendModLog(interaction.guild, logEmbed, true);

            try {
                const dmEmbed = new EmbedBuilder()
                    .setColor(0xFFA500)
                    .setTitle(`Bạn đã bị mute trong ${interaction.guild.name}`)
                    .setDescription(`**Lý do:** ${reason}\n**Thời gian:** ${formattedDuration}\n**Kết thúc lúc:** <t:${Math.floor(endTime.getTime() / 1000)}:F>`)
                    .setFooter({ text: `Trong thời gian mute, bạn không thể gửi tin nhắn hoặc tham gia voice chat.` })
                    .setTimestamp();

                await targetUser.send({ embeds: [dmEmbed] });
            } catch (error) {
                logger.error('MODERATION', `Không thể gửi DM cho ${targetUser.tag}`);
            }

        } catch (error) {
            logger.error('MODERATION', 'Lỗi khi mute thành viên:', error);
            await interaction.editReply({
                content: `${emojis.error} Đã xảy ra lỗi khi cấm ngôn người dùng: ${error.message}`,
                ephemeral: true
            });
        }
    },
};