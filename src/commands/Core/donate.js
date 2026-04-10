const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const { createLunabyEmbed } = require('../../utils/embedUtils');

const BANK_CODE = 'TCB';
const BANK_NAME = 'Techcombank';
const ACCOUNT_NUMBER = '6688887838';
const TRANSFER_NOTE = 'Ung ho Lunaby project';

function buildDonateQrUrl() {
    const params = new URLSearchParams({
        addInfo: TRANSFER_NOTE,
    });

    return `https://img.vietqr.io/image/${BANK_CODE}-${ACCOUNT_NUMBER}-compact2.png?${params.toString()}`;
}

function buildDonateActionRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel('Mở mã QR')
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
                name: 'Ủng hộ Lunaby project',
                iconURL: interaction.client.user.displayAvatarURL(),
            })
            .setTitle('Quét mã để chuyển khoản')
            .setDescription(
                [
                    'Cảm ơn bạn đã muốn ủng hộ dự án Lunaby.',
                    `**Ngân hàng:** ${BANK_NAME} (${BANK_CODE})`,
                    `**Số tài khoản:** \`${ACCOUNT_NUMBER}\``,
                    `**Nội dung chuyển khoản:** \`${TRANSFER_NOTE}\``,
                ].join('\n')
            )
            .setImage(buildDonateQrUrl())
            .setFooter({ text: 'Bạn có thể quét QR hoặc bấm nút bên dưới để mở ảnh mã QR.' });

        await interaction.reply({
            embeds: [embed],
            components: [buildDonateActionRow()],
        });
    },
};