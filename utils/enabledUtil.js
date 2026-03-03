const { EmbedBuilder } = require('discord.js');
const MariaModDB = require('../services/database/MariaModDB');

const CHECK = '✅';
const CROSS = '❎';

exports.createEmbed = async function (interaction, channel, guildId, channelId) {
    const disabledCommands = await MariaModDB.getDisabledCommands(guildId, channelId);
    const disabledSet = new Set(disabledCommands);

    const embed = new EmbedBuilder()
        .setAuthor({ name: `Lệnh đang hoạt động tại #${channel.name}` })
        .setColor(0x9B59B6);

    const allCommands = [...interaction.client.commands.values()].filter(c => c.data.name !== 'disable' && c.data.name !== 'enable');
    const groups = {};

    for (const cmd of allCommands) {
        let category = cmd.category || 'Các Lệnh Khác';
        category = category.charAt(0).toUpperCase() + category.slice(1);
        if (!groups[category]) groups[category] = [];
        groups[category].push(cmd.data.name);
    }

    const fields = [];

    const sortedCategories = Object.keys(groups).sort();

    for (const groupName of sortedCategories) {
        const cmds = groups[groupName].sort();
        let allDisabled = true;

        for (const cmd of cmds) {
            if (!disabledSet.has(cmd)) {
                allDisabled = false;
                break;
            }
        }

        const groupTitle = (allDisabled ? CROSS : CHECK) + ` **${groupName}**`;
        const formattedCmds = cmds.map(cmd => {
            if (disabledSet.has(cmd)) return `~~*\`${cmd}\`*~~`;
            return `**${cmd}**`;
        });

        let commandString = '';
        let wordCount = 0;
        let pCount = 0;

        for (const cmdStr of formattedCmds) {
            wordCount += cmdStr.length + 1;
            if (wordCount >= 1024) {
                fields.push({
                    name: groupTitle + (pCount > 0 ? ` [${pCount + 1}]` : ''),
                    value: commandString
                });
                commandString = '';
                wordCount = cmdStr.length + 1;
                pCount++;
            }
            commandString += cmdStr + ' ';
        }

        if (commandString) {
            fields.push({
                name: groupTitle + (pCount > 0 ? ` [${pCount + 1}]` : ''),
                value: commandString
            });
        }
    }

    embed.addFields(fields);
    return embed;
};