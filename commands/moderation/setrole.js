const { SlashCommandBuilder } = require('discord.js');
const RoleService = require('../../services/RoleService');
const { createLunabyEmbed } = require('../../utils/embedUtils');
const { USER_ROLES } = require('../../config/constants');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setrole')
        .setDescription('Thay đổi quyền (Role) của người dùng trong Bot (Owner Only)')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Người dùng cần thay đổi quyền')
                .setRequired(true))
        .addStringOption(option => {
            const opt = option.setName('role')
                .setDescription('Quyền mới')
                .setRequired(true);

            Object.entries(USER_ROLES).forEach(([key, value]) => {
                opt.addChoices({ name: value, value: value });
            });
            return opt;
        }),

    prefix: {
        name: 'setrole',
        aliases: ['giverole', 'admin'],
        description: 'Thay đổi quyền người dùng',
        adminOnly: false
    },

    async execute(interaction) {
        if (!interaction.isCommand || !interaction.isCommand()) {
            return this.executePrefix(interaction.message || interaction, [
                interaction.args[0],
                interaction.args[1]
            ]);
        }

        const targetUser = interaction.options.getUser('user');
        const role = interaction.options.getString('role');

        await this.handleRoleChange(interaction, targetUser, role);
    },

    async executePrefix(message, args) {
        if (!args || args.length < 2) {
            return message.reply(`**Cách dùng:** \`e.setrole @user <role>\`\nCác role hợp lệ: ${Object.values(USER_ROLES).join(', ')}`);
        }

        const targetUser = message.mentions.users.first() || await message.client.users.fetch(args[0]).catch(() => null);
        if (!targetUser) {
            return message.reply('Không tìm thấy người dùng này.');
        }

        const role = args[1].toLowerCase();
        if (!Object.values(USER_ROLES).includes(role)) {
            return message.reply(`Quyền không hợp lệ! Hãy dùng một trong các quyền sau: ${Object.values(USER_ROLES).join(', ')}`);
        }

        await this.handleRoleChange(message, targetUser, role);
    },

    async handleRoleChange(interactionOrMessage, targetUser, role) {
        const isInteraction = interactionOrMessage.isCommand && interactionOrMessage.isCommand();
        const replyFunc = isInteraction ? (data) => interactionOrMessage.reply(data) : (data) => interactionOrMessage.reply(data);
        const executorId = isInteraction ? interactionOrMessage.user.id : interactionOrMessage.author.id;

        try {
            if (executorId !== process.env.OWNER_ID?.trim()) {
                return replyFunc({ content: 'Lệnh này chỉ dành cho Owner của Bot!', ephemeral: true });
            }

            const currentRole = await RoleService.getUserRole(targetUser.id);
            if (currentRole === role) {
                return replyFunc({ content: `Người dùng **${targetUser.tag}** hiện đã có quyền **${role}** rồi.`, ephemeral: true });
            }

            await RoleService.setUserRole(targetUser.id, role);

            const embed = createLunabyEmbed()
                .setTitle('👑 Cấp quyền thành công')
                .setColor(0xF1C40F)
                .setDescription(`Đã thay đổi quyền của <@${targetUser.id}>.`)
                .addFields(
                    { name: '👤 Người dùng', value: targetUser.tag, inline: true },
                    { name: '⭐ Quyền cũ', value: currentRole, inline: true },
                    { name: '🌟 Quyền mới', value: role, inline: true }
                );

            await replyFunc({ embeds: [embed] });
        } catch (error) {
            console.error('Error in setrole command:', error);
            await replyFunc({ content: 'Đã xảy ra lỗi khi cập nhật Quyền cho người dùng này.', ephemeral: true });
        }
    }
};