const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const OWNER_ID = process.env.OWNER_ID;

const WARNINGS = (t) => ({
    database: t('admin.reset.warn_database'),
    users: t('admin.reset.warn_users'),
});

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reset')
        .setDescription('Xóa và reset cơ sở dữ liệu (chỉ dành cho owner)')
        .addStringOption(opt => opt.setName('type').setDescription('Reset mode').setRequired(true)
            .addChoices(
                { name: 'Database (Conversations & All Data)', value: 'database' },
                { name: 'User Profiles (XP, Level, Achievements)', value: 'users' }
            )),
    prefix: { name: 'reset', aliases: ['r'], description: 'Reset database' },
    cooldown: 10,

    async execute(interaction) {
        if (interaction.user.id !== OWNER_ID) {
            return interaction.reply({ content: interaction.t('commands.admin.reset.owner_only'), ephemeral: true });
        }

        const type = interaction.options.getString('type');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`reset_${type}_confirm`).setLabel(interaction.t('commands.admin.reset.confirm_btn')).setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`reset_${type}_cancel`).setLabel(interaction.t('commands.admin.reset.cancel_btn')).setStyle(ButtonStyle.Danger),
        );

        await interaction.reply({ content: WARNINGS(interaction.t)[type], components: [row], ephemeral: true });
    },
};