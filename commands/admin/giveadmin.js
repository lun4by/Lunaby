const { SlashCommandBuilder } = require('discord.js');
const RoleService = require('../../services/RoleService');
const { createLunabyEmbed } = require('../../utils/embedUtils');
const { USER_ROLES } = require('../../config/constants');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('giveadmin')
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

    prefix: { name: 'giveadmin', aliases: ['giverole'], description: 'Thay đổi quyền người dùng' },
    cooldown: 5,

    async execute(interaction) {
        const isSlash = interaction.isCommand && interaction.isCommand();
        
        const targetUser = isSlash 
            ? interaction.options.getUser('user') 
            : interaction.message?.mentions?.users?.first();
            
        let roleRaw = isSlash 
            ? interaction.options.getString('role') 
            : interaction.args?.find(a => !a.match(/^<@!?\d+>$/));
            
        const role = roleRaw?.toLowerCase();

        if (!targetUser || !role) {
            return interaction.reply(`**Cách dùng:** \`e.giveadmin @user <role>\`\nCác role hợp lệ: ${Object.values(USER_ROLES).join(', ')}`);
        }

        if (!Object.values(USER_ROLES).includes(role)) {
            return interaction.reply(`Quyền không hợp lệ! Hãy dùng một trong các quyền sau: ${Object.values(USER_ROLES).join(', ')}`);
        }

        const executorId = interaction.user.id;

        try {
            if (executorId !== process.env.OWNER_ID?.trim()) {
                return interaction.reply({ content: 'Lệnh này chỉ dành cho Owner của Bot!', ephemeral: true });
            }

            const currentRole = await RoleService.getUserRole(targetUser.id);
            if (currentRole === role) {
                return interaction.reply({ content: `Người dùng **${targetUser.tag}** hiện đã có quyền **${role}** rồi.`, ephemeral: true });
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

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            logger.error('ADMIN', 'Error in giveadmin command:', error);
            await interaction.reply({ content: 'Đã xảy ra lỗi khi cập nhật Quyền cho người dùng này.', ephemeral: true });
        }
    }
};