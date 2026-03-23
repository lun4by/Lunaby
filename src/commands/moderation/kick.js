const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const ConversationService = require('../../services/ai/ConversationService.js');
const { logModAction } = require('../../utils/modUtils.js');
const { sendModLog, createModActionEmbed } = require('../../utils/modLogUtils.js');
const { handlePermissionError } = require('../../utils/permissionUtils.js');
const logger = require('../../utils/logger.js');
const prompts = require('../../config/prompts.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('�u?i m?t th�nh vi�n kh?i server')
        .addUserOption(option =>
            option.setName('user').setDescription('Th�nh vi�n c?n du?i').setRequired(true)
        )
        .addStringOption(option =>
            option.setName('reason').setDescription('L� do du?i').setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
    prefix: { name: 'kick', aliases: ['c?m'], description: 'C?m ngu?i d�ng' },
    cooldown: 5,

    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
            return interaction.reply({
                content: 'B?n kh�ng c� quy?n s? d?ng l?nh n�y!',
                ephemeral: true,
            });
        }

        const targetUser = interaction.options.getUser('user');
        const targetMember = interaction.options.getMember('user');

        if (!targetMember) {
            return interaction.reply({
                content: 'Kh�ng t�m th?y th�nh vi�n n�y!',
                ephemeral: true,
            });
        }

        const reason = interaction.options.getString('reason')?.trim() || 'Kh�ng c� l� do c? th?';

        if (!targetMember.kickable) {
            return interaction.reply({
                content: 'Kh�ng th? du?i th�nh vi�n n�y!',
                ephemeral: true,
            });
        }

        await interaction.deferReply();

        try {
            const prompt = prompts.moderation.kick
                .replace('${username}', targetUser.username)
                .replace('${reason}', reason);

            const aiResponse = await ConversationService.getCompletion(prompt);

            const kickEmbed = new EmbedBuilder()
                .setColor(0xffa500)
                .setTitle('?? �u?i th�nh c�ng')
                .setDescription(aiResponse)
                .addFields(
                    { name: 'Ngu?i d�ng', value: targetUser.tag, inline: true },
                    { name: 'ID', value: targetUser.id, inline: true },
                    { name: 'L� do', value: reason, inline: false },
                    { name: 'Moderator', value: interaction.user.tag, inline: true },
                    { name: 'Ng�y', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                )
                .setFooter({ text: `�u?c th?c hi?n b?i ${interaction.user.tag}` })
                .setTimestamp();

            await targetMember.kick(reason);

            await logModAction({
                guildId: interaction.guild.id,
                targetId: targetUser.id,
                moderatorId: interaction.user.id,
                action: 'kick',
                reason,
            });

            try {
                await interaction.editReply({ embeds: [kickEmbed] });
            } catch (error) {
                if (error.code === 50013 || error.message.includes('permission')) {
                    await handlePermissionError(interaction, 'embedLinks', interaction.user.username, 'editReply');
                } else {
                    throw error;
                }
            }

            const logEmbed = createModActionEmbed({
                title: '?? �u?i th�nh c�ng',
                description: `�� du?i ${targetUser.tag} kh?i server.`,
                color: 0xffa500,
                fields: [
                    { name: 'Ngu?i d�ng', value: targetUser.tag, inline: true },
                    { name: 'ID', value: targetUser.id, inline: true },
                    { name: 'Moderator', value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: true },
                    { name: 'L� do', value: reason, inline: false },
                    { name: 'Ng�y', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
                ],
                footer: `Server: ${interaction.guild.name}`,
            });

            await sendModLog(interaction.guild, logEmbed, true);
        } catch (error) {
            logger.error('MODERATION', `L?i khi du?i ${targetUser.tag}: ${error.message}`);
            await interaction.editReply({
                content: `�� x?y ra l?i khi du?i ${targetUser.tag}: ${error.message}`,
            });
        }
    },
};
