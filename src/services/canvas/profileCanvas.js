const { AttachmentBuilder } = require('discord.js');
const { Profile } = require('lunaby-canvas');
const logger = require('../../utils/logger.js');

const HEX_COLOR_REGEX = /^#([a-fA-F0-9]{6}|[a-fA-F0-9]{3})$/;

async function generateProfileCard(data) {
    const { user, member = null, profile = {} } = data;

    const theme = HEX_COLOR_REGEX.test(profile.color || '') ? profile.color : '#9B59B6';

    const profileCard = new Profile()
        .setUser(user.id)
        .setBorder(theme);

    const activity = member?.presence?.activities?.[0];
    const largeImage = activity?.assets?.largeImageURL?.({ extension: 'png', size: 512 }) || null;

    if (activity) {
        profileCard.setActivity({ activity, largeImage });
    }

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