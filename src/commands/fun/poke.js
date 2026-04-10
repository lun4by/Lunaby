const { SlashCommandBuilder } = require('discord.js');
const { buildActionEmbed } = require('../../utils/gifAction');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('poke')
        .setDescription('Chọc ai đó')
        .addUserOption(opt => opt.setName('user').setDescription('Người bạn muốn chọc').setRequired(false)),
    prefix: { name: 'poke', aliases: ['choc'], description: 'Chọc ai đó' },
    cooldown: 5,

    async execute(interaction) {
        const target = interaction.options.getUser('user');
        const embed = buildActionEmbed('poke', interaction.user, target);
        await interaction.reply({ embeds: [embed] });
    }
};
