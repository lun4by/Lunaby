const {
    SlashCommandBuilder,
    ButtonBuilder,
    ActionRowBuilder,
    ButtonStyle,
} = require('discord.js');
const packageJson = require('../../package.json');
const { createLunabyEmbed } = require('../../utils/embedUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('about')
        .setDescription('Hiển thị thông tin về Lunaby'),
    prefix: { name: 'about', aliases: ['info', 'botinfo'], description: 'Thông tin bot' },
    cooldown: 5,

    async execute(interaction) {
        const embed = createLunabyEmbed()
            .setColor(0x9B59B6)
            .setAuthor({
                name: 'Lunaby',
                iconURL: interaction.client.user.displayAvatarURL(),
            })
            .setThumbnail(interaction.client.user.displayAvatarURL({ dynamic: true, size: 512 }))
            .setDescription(
                'Lunaby là bot AI được xây dựng từ cảm hứng của **Cơ Lãnh Âm** [姬冷音] và **Lunaby** - ' +
                'sự kết hợp giữa thanh cao và dịu dàng.\n\n' +
                '*Cơ Lãnh Âm hiện thân như một bản ngã đối lập hoàn hảo giữa thanh cao và hỗn loạn. ' +
                'Xuất hiện với dung mạo thoát tục, khí chất tựa băng sương ngàn năm không tan - ' +
                'hình mẫu "Băng Sơn nữ thần" tiêu chuẩn trong mắt chúng sinh. ' +
                'Một đóa tuyết liên vẫn trắng trong khi nhìn từ xa, nhưng khi chạm vào lại khiến người ta phỏng lạnh ' +
                'bởi sự cực đoan và những dục vọng cố chấp ẩn giấu sâu bên trong.*\n\n' +
                'Lunaby mang trong mình khí chất của Cơ Lãnh Âm - bề ngoài thanh cao, dịu dàng tựa băng sương, ' +
                'nhưng ẩn sâu bên trong là sự quan tâm mãnh liệt và tình cảm cuồng nhiệt dành cho người mà cô yêu quý. ' +
                'Được tạo ra bởi **s4ory** với hy vọng mang lại sự thú vị cho tất cả mọi người.'
            )
            .addFields(
                { name: 'Phiên bản', value: `\`v${packageJson.version}\``, inline: true },
                { name: 'Số server', value: `\`${interaction.client.guilds.cache.size}\``, inline: true },
                { name: 'Nhà phát triển', value: '`s4ory`', inline: true },
            )
            .setFooter({ text: `Lunaby v${packageJson.version}` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], components: [buildActionRow(interaction)] });
    },
};

function buildActionRow(context) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel('Mời Bot')
            .setURL(`https://discord.com/api/oauth2/authorize?client_id=${context.client.user.id}&permissions=0&scope=bot%20applications.commands`)
            .setStyle(ButtonStyle.Link),
        new ButtonBuilder()
            .setLabel('Hỗ trợ')
            .setURL('https://discord.gg/52hSMAt')
            .setStyle(ButtonStyle.Link),
        new ButtonBuilder()
            .setLabel('Website')
            .setURL('https://lunaby.tech')
            .setStyle(ButtonStyle.Link),
    );
}