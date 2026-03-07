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

        // Replace placeholders
        const message = welcomeMessageTemp
            .replace(/{user}/g, `<@${member.id}>`)
            .replace(/{server}/g, member.guild.name)
            .replace(/{count}/g, member.guild.memberCount);

        await channel.send({ content: message });
        logger.info('GREETER', `Đã gửi tin nhắn chào mừng cho ${member.user.tag} ở server ${member.guild.name}`);
    } catch (error) {
        logger.error('GREETER', `Lỗi khi xử lý chào mừng thành viên mới:`, error);
    }
}

function setupGuildMemberAddEvent(client) {
    client.on(Events.GuildMemberAdd, handleGuildMemberAdd);
    logger.info("EVENTS", "Đã đăng ký event: GuildMemberAdd");
}

module.exports = { setupGuildMemberAddEvent, handleGuildMemberAdd };