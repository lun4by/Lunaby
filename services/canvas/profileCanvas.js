const { AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const path = require('path');
const logger = require('../../utils/logger.js');

const ASSETS_PATH = path.join(__dirname, '../../assets');

class ProfileCanvas {
    constructor() {
        this.imageCache = new Map();
        this.defaultColor = '#9B59B6';
    }

    async loadImageWithCache(imagePath) {
        if (this.imageCache.has(imagePath)) {
            return this.imageCache.get(imagePath);
        }
        try {
            const image = await loadImage(imagePath);
            this.imageCache.set(imagePath, image);
            return image;
        } catch (error) {
            logger.warn('PROFILE_CANVAS', `Cannot load image: ${path.basename(imagePath)}`);
            return null;
        }
    }

    async loadImageFromUrl(url) {
        if (this.imageCache.has(url)) {
            return this.imageCache.get(url);
        }
        try {
            const image = await loadImage(url);
            this.imageCache.set(url, image);
            return image;
        } catch (error) {
            logger.warn('PROFILE_CANVAS', `Cannot load URL image: ${url}`);
            return null;
        }
    }

    drawRoundRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.arcTo(x + width, y, x + width, y + height, radius);
        ctx.arcTo(x + width, y + height, x, y + height, radius);
        ctx.arcTo(x, y + height, x, y, radius);
        ctx.arcTo(x, y, x + width, y, radius);
        ctx.closePath();
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 155, g: 89, b: 182 };
    }

    async createProfileCard(data) {
        const {
            user,
            member,
            profile = {},
            xpData = {},
            serverRank = null,
            globalRank = null
        } = data;

        const themeColor = profile.color || this.defaultColor;
        const rgb = this.hexToRgb(themeColor);

        const width = 800;
        const height = 500;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // === BACKGROUND ===
        if (profile.background) {
            try {
                const bgImage = await this.loadImageFromUrl(profile.background);
                if (bgImage) {
                    ctx.drawImage(bgImage, 0, 0, width, height);
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
                    ctx.fillRect(0, 0, width, height);
                }
            } catch {
                this.drawDefaultBackground(ctx, width, height, rgb);
            }
        } else {
            this.drawDefaultBackground(ctx, width, height, rgb);
        }

        // === LEFT PANEL (Purple) ===
        const leftPanelWidth = 280;
        ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.9)`;
        ctx.fillRect(0, 0, leftPanelWidth, height);

        // === BANNER (Top Right) ===
        const bannerHeight = 180;
        ctx.save();
        this.drawRoundRect(ctx, leftPanelWidth, 0, width - leftPanelWidth, bannerHeight, 0);
        ctx.clip();

        if (profile.banner) {
            try {
                const bannerImg = await this.loadImageFromUrl(profile.banner);
                if (bannerImg) {
                    ctx.drawImage(bannerImg, leftPanelWidth, 0, width - leftPanelWidth, bannerHeight);
                }
            } catch { }
        } else {
            const gradient = ctx.createLinearGradient(leftPanelWidth, 0, width, bannerHeight);
            gradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.6)`);
            gradient.addColorStop(1, `rgba(${rgb.r * 0.7}, ${rgb.g * 0.7}, ${rgb.b * 0.7}, 0.8)`);
            ctx.fillStyle = gradient;
            ctx.fill();
        }
        ctx.restore();

        // === TIP BADGE (Top Right Corner) ===
        const tipCount = profile.tips?.received || 0;
        ctx.fillStyle = themeColor;
        this.drawRoundRect(ctx, width - 120, 10, 110, 40, 8);
        ctx.fill();

        ctx.font = 'bold 16px Arial';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText('TIP', width - 80, 35);

        ctx.fillStyle = '#FFFFFF';
        this.drawRoundRect(ctx, width - 50, 10, 40, 40, 8);
        ctx.fill();
        ctx.fillStyle = themeColor;
        ctx.font = 'bold 18px Arial';
        ctx.fillText(tipCount.toString(), width - 30, 37);

        // === AVATAR ===
        const avatarSize = 130;
        const avatarX = leftPanelWidth / 2;
        const avatarY = 100;

        // Avatar glow
        ctx.save();
        ctx.shadowColor = 'rgba(255, 215, 0, 0.8)';
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(avatarX, avatarY, avatarSize / 2 + 8, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 215, 0, 0.3)';
        ctx.fill();
        ctx.restore();

        // Wreath (if rank <= 10)
        if (profile.wreath || (serverRank && serverRank <= 10)) {
            const wreathSize = avatarSize + 50;
            try {
                const wreathImg = profile.wreath
                    ? await this.loadImageFromUrl(profile.wreath)
                    : await this.loadImageWithCache(path.join(ASSETS_PATH, 'wreath.png'));
                if (wreathImg) {
                    ctx.drawImage(wreathImg, avatarX - wreathSize / 2, avatarY - wreathSize / 2, wreathSize, wreathSize);
                }
            } catch { }
        }

        // Avatar image
        const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 256 });
        try {
            const avatarImg = await this.loadImageFromUrl(avatarUrl);
            if (avatarImg) {
                ctx.save();
                ctx.beginPath();
                ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2);
                ctx.clip();
                ctx.drawImage(avatarImg, avatarX - avatarSize / 2, avatarY - avatarSize / 2, avatarSize, avatarSize);
                ctx.restore();

                // Avatar border
                ctx.beginPath();
                ctx.arc(avatarX, avatarY, avatarSize / 2 + 3, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(255, 215, 0, 0.8)';
                ctx.lineWidth = 4;
                ctx.stroke();
            }
        } catch { }

        // === USERNAME ===
        ctx.font = 'bold 26px Arial';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText(member?.displayName || user.username, avatarX, avatarY + avatarSize / 2 + 40);

        ctx.font = '14px Arial';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.fillText(user.tag, avatarX, avatarY + avatarSize / 2 + 60);

        // === LEVEL/RANK BADGES ===
        const badgeY = avatarY + avatarSize / 2 + 90;
        const badgeWidth = 70;
        const badgeHeight = 55;
        const badgeSpacing = 10;
        const totalBadgesWidth = 3 * badgeWidth + 2 * badgeSpacing;
        const badgeStartX = avatarX - totalBadgesWidth / 2;

        const badges = [
            { label: 'LEVEL', value: xpData.level || 1 },
            { label: 'SERVER', value: serverRank ? `${serverRank}${this.getOrdinal(serverRank)}` : 'N/A' },
            { label: 'GLOBAL', value: globalRank ? `${globalRank}${this.getOrdinal(globalRank)}` : 'N/A' }
        ];

        badges.forEach((badge, i) => {
            const x = badgeStartX + i * (badgeWidth + badgeSpacing);

            // Badge background
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            this.drawRoundRect(ctx, x, badgeY, badgeWidth, badgeHeight, 10);
            ctx.fill();

            // Badge border
            ctx.strokeStyle = themeColor;
            ctx.lineWidth = 2;
            this.drawRoundRect(ctx, x, badgeY, badgeWidth, badgeHeight, 10);
            ctx.stroke();

            // Badge value
            ctx.font = 'bold 18px Arial';
            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'center';
            ctx.fillText(badge.value.toString(), x + badgeWidth / 2, badgeY + 25);

            // Badge label
            ctx.font = '10px Arial';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.fillText(badge.label, x + badgeWidth / 2, badgeY + 45);
        });

        // === RIGHT PANEL - INFO SECTIONS ===
        const infoX = leftPanelWidth + 30;
        const infoWidth = width - leftPanelWidth - 60;
        let infoY = bannerHeight + 30;

        // BIO Section
        this.drawInfoSection(ctx, infoX, infoY, infoWidth, 80, 'BIO',
            profile.bio || 'No bio written.', themeColor);
        infoY += 100;

        // BIRTHDAY Section
        const birthdayText = profile.birthday
            ? this.formatBirthday(profile.birthday)
            : 'Not set';
        this.drawInfoSection(ctx, infoX, infoY, infoWidth / 2 - 10, 60, 'BIRTHDAY',
            birthdayText, themeColor);

        // BALANCE Section (right side)
        const balanceX = infoX + infoWidth / 2 + 10;
        const bank = profile.economy?.bank || 0;
        const wallet = profile.economy?.wallet || 0;
        this.drawBalanceSection(ctx, balanceX, infoY, infoWidth / 2 - 10, 60,
            bank, wallet, themeColor);

        infoY += 80;

        // === SMALL CHARACTER (Optional) ===
        if (profile.emblem) {
            try {
                const emblemImg = await this.loadImageFromUrl(profile.emblem);
                if (emblemImg) {
                    const emblemSize = 100;
                    ctx.drawImage(emblemImg, width - emblemSize - 20, height - emblemSize - 20, emblemSize, emblemSize);
                }
            } catch { }
        }

        return canvas.toBuffer('image/png');
    }

    drawDefaultBackground(ctx, width, height, rgb) {
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, `rgb(${rgb.r * 0.3}, ${rgb.g * 0.3}, ${rgb.b * 0.3})`);
        gradient.addColorStop(1, `rgb(${rgb.r * 0.5}, ${rgb.g * 0.5}, ${rgb.b * 0.5})`);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        // Pattern overlay
        ctx.globalAlpha = 0.1;
        for (let i = 0; i < 20; i++) {
            const size = Math.random() * 50 + 20;
            const x = Math.random() * width;
            const y = Math.random() * height;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fillStyle = '#FFFFFF';
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    drawInfoSection(ctx, x, y, width, height, label, value, themeColor) {
        // Background
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        this.drawRoundRect(ctx, x, y, width, height, 10);
        ctx.fill();

        // Label with line
        ctx.font = 'bold 12px Arial';
        ctx.fillStyle = '#666666';
        ctx.textAlign = 'left';
        ctx.fillText(label, x + 15, y + 20);

        // Decorative line
        const labelWidth = ctx.measureText(label).width;
        ctx.strokeStyle = '#CCCCCC';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 20 + labelWidth, y + 16);
        ctx.lineTo(x + width - 15, y + 16);
        ctx.stroke();

        // Value
        ctx.font = '16px Arial';
        ctx.fillStyle = '#333333';
        ctx.fillText(value, x + 15, y + height - 20);
    }

    drawBalanceSection(ctx, x, y, width, height, bank, wallet, themeColor) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        this.drawRoundRect(ctx, x, y, width, height, 10);
        ctx.fill();

        ctx.font = 'bold 12px Arial';
        ctx.fillStyle = '#666666';
        ctx.textAlign = 'left';
        ctx.fillText('BALANCE', x + 15, y + 20);

        // Bank & Wallet
        ctx.font = '14px Arial';
        ctx.fillStyle = '#333333';
        ctx.fillText(`🏦: ${bank.toLocaleString()}`, x + 15, y + height - 20);
        ctx.fillText(`💰: ${wallet.toLocaleString()}`, x + width / 2, y + height - 20);
    }

    formatBirthday(birthday) {
        if (!birthday) return 'Not set';
        const [day, month] = birthday.split('-');
        const months = ['', 'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];
        return `${parseInt(day)}${this.getOrdinal(parseInt(day))} ${months[parseInt(month)] || month}`;
    }

    getOrdinal(n) {
        if (!n || isNaN(n)) return '';
        const s = ['th', 'st', 'nd', 'rd'];
        const v = n % 100;
        return s[(v - 20) % 10] || s[v] || s[0];
    }

    clearCache() {
        this.imageCache.clear();
    }
}

const profileCanvas = new ProfileCanvas();

async function generateProfileCard(data) {
    const buffer = await profileCanvas.createProfileCard(data);
    return new AttachmentBuilder(buffer, { name: 'profile.png' });
}

module.exports = {
    generateProfileCard,
    ProfileCanvas: profileCanvas
};
