const {
    SlashCommandBuilder,
    ButtonBuilder,
    ActionRowBuilder,
    ButtonStyle,
} = require('discord.js');
const packageJson = require('../../../package.json');
const { createLunabyEmbed } = require('../../utils/discord/embedUtils');
const { SUPPORT_SERVER_URL } = require('../../utils/discord/blacklistUtils');

const DISCORD_BOT_PERMISSIONS = process.env.DISCORD_BOT_PERMISSIONS || '0';
const WEBSITE_URL = process.env.WEBSITE_URL || 'https://lunaby.tech';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('about')
        .setDescription('Hiển thị thông tin về Lunaby'),
    prefix: { name: 'about', aliases: ['info', 'botinfo'], description: 'Thông tin bot' },
    cooldown: 5,

    async execute(interaction) {
        const embed = createLunabyEmbed()
            .setAuthor({
                name: 'Lunaby',
                iconURL: interaction.client.user.displayAvatarURL(),
            })
            .setThumbnail(interaction.client.user.displayAvatarURL({ dynamic: true, size: 512 }))
            .setDescription(interaction.t('commands.about.about_text'))
            .addFields(
                { name: interaction.t('commands.about.version'), value: `\`v${packageJson.version}\``, inline: true },
                { name: interaction.t('commands.about.servers'), value: `\`${interaction.client.guilds.cache.size}\``, inline: true },
                { name: interaction.t('commands.about.developer'), value: '`s4ory`', inline: true },
            )
            .setFooter({ text: `Lunaby v${packageJson.version}` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], components: [buildActionRow(interaction)] });
    },
};

function buildActionRow(interaction) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel(interaction.t('commands.about.invite_btn'))
            .setURL(`https://discord.com/api/oauth2/authorize?client_id=${interaction.client.user.id}&permissions=${DISCORD_BOT_PERMISSIONS}&scope=bot%20applications.commands`)
            .setStyle(ButtonStyle.Link),
        new ButtonBuilder()
            .setLabel(interaction.t('commands.about.support_btn'))
            .setURL(SUPPORT_SERVER_URL)
            .setStyle(ButtonStyle.Link),
        new ButtonBuilder()
            .setLabel(interaction.t('commands.about.website_btn'))
            .setURL(WEBSITE_URL)
            .setStyle(ButtonStyle.Link),
    );
}
