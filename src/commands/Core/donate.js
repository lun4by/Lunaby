const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const { createLunabyEmbed } = require('../../utils/discord/embedUtils');

const BANK_CODE = 'TCB';
const BANK_NAME = 'Techcombank';
const ACCOUNT_NUMBER = '6688887838';
const ACCOUNT_NAME = 'NGUYEN HO HUU HOANG';
const TRANSFER_NOTE = 'Donate for Lunaby project';

function buildDonateQrUrl() {
    const params = new URLSearchParams({
        addInfo: TRANSFER_NOTE,
        accountName: ACCOUNT_NAME,
    });

    return `https://img.vietqr.io/image/${BANK_CODE}-${ACCOUNT_NUMBER}-compact2.png?${params.toString()}`;
}

function buildDonateActionRow(interaction) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel(interaction.t('commands.donate.open_qr'))
            .setStyle(ButtonStyle.Link)
            .setURL(buildDonateQrUrl()),
    );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('donate')
        .setDescription('Hiển thị mã QR để ủng hộ Lunaby project'),
    prefix: {
        name: 'donate',
        aliases: ['ungho', 'donation'],
        description: 'Hiển thị mã QR ủng hộ Lunaby project',
    },
    cooldown: 5,

    async execute(interaction) {
        const embed = createLunabyEmbed()
            .setAuthor({
                name: interaction.t('commands.donate.title'),
                iconURL: interaction.client.user.displayAvatarURL(),
            })
            .setTitle(interaction.t('commands.donate.scan_qr'))
            .setDescription(
                interaction.t('commands.donate.description', {
                    bank: `${BANK_NAME} (${BANK_CODE})`,
                    account: ACCOUNT_NUMBER,
                    note: TRANSFER_NOTE
                })
            )
            .setImage(buildDonateQrUrl())
            .setFooter({ text: interaction.t('commands.donate.footer') });

        await interaction.reply({
            embeds: [embed],
            components: [buildDonateActionRow(interaction)],
        });
    },
};
