const { AttachmentBuilder } = require('discord.js');
const { Profile } = require('lunaby-canvas');
const logger = require('../../utils/logger.js');

const HEX_COLOR_REGEX = /^#([a-fA-F0-9]{6}|[a-fA-F0-9]{3})$/;

async function generateProfileCard(data) {
    const { user, member = null, presence = null, profile = {} } = data;

    const theme = HEX_COLOR_REGEX.test(profile.color || '') ? profile.color : '#9B59B6';

    const profileCard = new Profile()
        .setUser(user.id)
        .setBorder(theme);

    const resolvedPresence = presence || member?.presence || null;
    const activities = Array.isArray(resolvedPresence?.activities) ? resolvedPresence.activities : [];
    const activity = activities.find((entry) => entry.type !== 4 && entry.name) || activities[0] || null;
    const largeImage = activity?.assets?.largeImageURL?.({ extension: 'png', size: 512 }) || null;

    if (activity) {
        logger.info('profile_canvas', `Activity found: type=${activity.type}, name=${activity.name}`);
        profileCard.setActivity({ activity, largeImage });
    } else {
        logger.info('profile_canvas', `No activity for user ${user.id} (presence: ${resolvedPresence ? 'exists' : 'null'})`);
    }

    try {
        const buffer = await profileCard.build();
        return new AttachmentBuilder(buffer, { name: 'profile.png' });
    } catch (err) {
        logger.error('profile_canvas', 'Failed to build profile:', err);
        throw err;
    }
}

module.exports = {
    generateProfileCard
};