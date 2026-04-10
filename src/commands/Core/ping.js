const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const packageJson = require('../../../package.json');
const { formatUptime } = require('../../utils/string');
const { createLunabyEmbed } = require('../../utils/embedUtils');
const { getSystemMetrics } = require('../../utils/systemMetrics');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Kiểm tra độ trễ và trạng thái kết nối của bot'),
    prefix: { name: 'ping', aliases: ['p'], description: 'Kiểm tra độ trễ' },
    cooldown: 10,

    async execute(interaction) {
        await interaction.deferReply();
        const sent = await interaction.fetchReply();
        const pingLatency = ((sent.createdTimestamp - interaction.createdTimestamp) / 100).toFixed(0);
        const latency = { ping: pingLatency, ws: interaction.client.ws.ping };

        const response = await interaction.editReply({
            embeds: [createStatusEmbed(latency, interaction)],
            components: [createActionRow(true, interaction)],
        });

        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 60000,
        });

        collector.on('collect', async (i) => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: interaction.t('system.only_caller_can_use'), ephemeral: true });
            }

            if (i.customId === 'refresh_status') {
                const refreshed = { ping: pingLatency, ws: interaction.client.ws.ping };
                await i.update({
                    embeds: [createStatusEmbed(refreshed, interaction)],
                    components: [createActionRow(true, interaction)],
                });
            }
        });

        collector.on('end', () => {
            interaction.editReply({ components: [createActionRow(false, interaction)] }).catch(() => { });
        });
    },
};

function createStatusEmbed({ ping, ws }, interaction) {
    const color = ping < 200 ? 0x57F287 : ping < 400 ? 0xFEE75C : 0xED4245;
    const { cpu, ram } = getSystemMetrics();

    return createLunabyEmbed()
        .setColor(color)
        .setAuthor({
            name: 'Lunaby',
            iconURL: interaction.client.user.displayAvatarURL(),
        })
        .addFields(
            { name: interaction.t('commands.ping.system_status'), value: `> **Bot**: \`${ping}ms\`\n> **WebSocket**: \`${ws}ms\``, inline: false },
            { name: interaction.t('commands.ping.resources'), value: `> **CPU**: \`${cpu}%\`\n> **RAM**: \`${ram}%\``, inline: false },
        )
        .setFooter({ text: `Lunaby v${packageJson.version} - ${formatUptime(process.uptime())}` });
}

function createActionRow(enabled = true, interaction) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('refresh_status')
            .setLabel(interaction.t('commands.ping.refresh'))
            .setStyle(ButtonStyle.Primary)
            .setDisabled(!enabled),
    );
}
