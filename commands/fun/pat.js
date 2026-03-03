const { SlashCommandBuilder } = require('discord.js');
const { buildActionEmbed } = require('../../utils/gifAction');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pat')
        .setDescription('Xoa đầu ai đó')
        .addUserOption(opt => opt.setName('user').setDescription('Người bạn muốn xoa đầu').setRequired(false)),
    prefix: { name: 'pat', aliases: [], description: 'Xoa đầu ai đó' },
    async execute(interaction) {
        const target = interaction.options.getUser('user');
        const embed = buildActionEmbed('pat', interaction.user, target);
        await interaction.reply({ embeds: [embed] });
    }
};
