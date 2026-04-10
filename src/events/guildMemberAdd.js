const { Events } = require("discord.js");
const MariaModDB = require("../services/database/MariaModDB");
const logger = require("../utils/logger");

async function handleGuildMemberAdd(member) {
    try {
        const guildId = member.guild.id;
        const settings = await MariaModDB.getGuildSettings(guildId);

        if (!settings || !settings.greeter?.welcome?.isEnabled) return;

        const welcomeChannelId = settings.greeter.welcome.channel;
        const welcomeMessageTemp = settings.greeter.welcome.message;

        if (!welcomeChannelId || !welcomeMessageTemp) return;

        const channel = member.guild.channels.cache.get(welcomeChannelId)
            || await member.guild.channels.fetch(welcomeChannelId).catch(() => null);

        if (!channel || !channel.isTextBased()) return;

        const message = welcomeMessageTemp
            .replace(/{user}/g, `<@${member.id}>`)
            .replace(/{server}/g, member.guild.name)
            .replace(/{count}/g, member.guild.memberCount);

        await channel.send({ content: message });
        logger.info('GREETER', `Sent welcome message to ${member.user.tag} in server ${member.guild.name}`);
    } catch (error) {
        logger.error('GREETER', `Error processing new member welcome:`, error);
    }
}

function setupGuildMemberAddEvent(client) {
    client.on(Events.GuildMemberAdd, handleGuildMemberAdd);
    logger.info("EVENTS", "Registered event: GuildMemberAdd");
}

module.exports = { setupGuildMemberAddEvent, handleGuildMemberAdd };