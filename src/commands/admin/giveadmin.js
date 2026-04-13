const { SlashCommandBuilder } = require('discord.js');
const RoleService = require('../../services/user/RoleService');
const { USER_ROLES } = require('../../config/constants');
const logger = require('../../utils/core/logger');
const emojis = require('../../config/emojis');
const { isSlashCommandInteraction, resolveHybridPrefix } = require('../../utils/discord/hybridCommand');

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
        const isSlash = isSlashCommandInteraction(interaction);

        const targetUser = isSlash
            ? interaction.options.getUser('user')
            : interaction.message?.mentions?.users?.first();

        let roleRaw = isSlash
            ? interaction.options.getString('role')
            : interaction.args?.find(a => !a.match(/^<@!?\d+>$/));

        const role = roleRaw?.toLowerCase();

        if (!targetUser || !role) {
            const prefix = await resolveHybridPrefix(interaction);
            return interaction.reply(`${emojis.error} ${interaction.t('commands.admin.giveadmin.usage', { prefix, roles: Object.values(USER_ROLES).join(', ') })}`);
        }

        if (!Object.values(USER_ROLES).includes(role)) {
            return interaction.reply(`${emojis.error} ${interaction.t('commands.admin.giveadmin.invalid_role', { roles: Object.values(USER_ROLES).join(', ') })}`);
        }

        const executorId = interaction.user.id;

        try {
            if (executorId !== process.env.OWNER_ID?.trim()) {
                return interaction.reply({ content: `${emojis.error} ${interaction.t('commands.admin.giveadmin.owner_only')}`, ephemeral: true });
            }

            const currentRole = await RoleService.getUserRole(targetUser.id);
            if (currentRole === role) {
                return interaction.reply({ content: `${emojis.error} ${interaction.t('commands.admin.giveadmin.already_has_role', { tag: targetUser.tag, role })}`, ephemeral: true });
            }

            await RoleService.setUserRole(targetUser.id, role);

            const successMessage = `${emojis.success} ${interaction.t('commands.admin.giveadmin.success', {
                id: targetUser.id,
                tag: targetUser.tag,
                oldRole: currentRole,
                newRole: role
            })}`;

            await interaction.reply({ content: successMessage });
        } catch (error) {
            logger.error('admin', 'Error in giveadmin command:', error);
            await interaction.reply({ content: `${emojis.error} ${interaction.t('commands.admin.giveadmin.error')}`, ephemeral: true });
        }
    }
};