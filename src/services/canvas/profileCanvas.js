const { AttachmentBuilder } = require('discord.js');
const { Profile } = require('lunaby-canvas');
const logger = require('../../utils/logger.js');

async function generateProfileCard(data) {
    const { user, profile = {} } = data;

    const theme = profile.color || '#9B59B6';

    const profileCard = new Profile()
        .setUserData({
            avatarURL: user.displayAvatarURL ? user.displayAvatarURL({ extension: 'png', size: 512 }) : "https://cdn.discordapp.com/embed/avatars/0.png",
            username: user.username || "Unknown",
            global_name: user.globalName || null,
            banner_color: theme,
            createdTimestamp: user.createdTimestamp || Date.now(),
            public_flags_array: []
        })
        .setBorder(theme);

    try {
        const buffer = await profileCard.build();
        return new AttachmentBuilder(buffer, { name: 'profile.png' });
    } catch (err) {
        logger.error('PROFILE_CANVAS', 'Failed to build profile:', err);
        throw err;
    }
}

module.exports = {
    generateProfileCard
};