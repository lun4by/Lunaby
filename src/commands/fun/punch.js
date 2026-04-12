const { SlashCommandBuilder } = require('discord.js');
const { buildActionEmbed } = require('../../utils/discord/gifAction');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('punch')
        .setDescription('Đấm ai đó')
        .addUserOption(opt => opt.setName('user').setDescription('Người bạn muốn đấm').setRequired(false)),
    prefix: { name: 'punch', aliases: ['dam'], description: 'Đấm ai đó' },
    cooldown: 5,

    async execute(interaction) {
        const target = interaction.options.getUser('user');
        const embed = buildActionEmbed('punch', interaction.user, target, interaction);
        await interaction.reply({ embeds: [embed] });
    }
};

