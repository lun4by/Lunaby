const { AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const logger = require('../../utils/logger.js');

const ASSETS_PATH = path.join(__dirname, '../../assets');
const FONTS_PATH = path.join(ASSETS_PATH, 'fonts');

// Register Montserrat fonts
try {
    registerFont(path.join(FONTS_PATH, 'Montserrat-Bold.otf'), { family: 'Montserrat', weight: 'bold' });
    registerFont(path.join(FONTS_PATH, 'Montserrat-SemiBold.otf'), { family: 'Montserrat', weight: '600' });
    registerFont(path.join(FONTS_PATH, 'Montserrat-Medium.otf'), { family: 'Montserrat', weight: '500' });
    registerFont(path.join(FONTS_PATH, 'Montserrat-Regular.otf'), { family: 'Montserrat', weight: 'normal' });
    registerFont(path.join(FONTS_PATH, 'Montserrat-Light.otf'), { family: 'Montserrat', weight: '300' });
} catch (err) {
    logger.warn('PROFILE_CANVAS', 'Could not register Montserrat fonts, falling back to default:', err.message);
}

const WIDTH = 934;
const HEIGHT = 500;
const CARD_RADIUS = 20;
const DEFAULT_THEME = '#9B59B6';

class ProfileCanvas {
    constructor() {
        this.imageCache = new Map();
    }
    async loadImg(src) {
        if (this.imageCache.has(src)) return this.imageCache.get(src);
        try {
            const img = await loadImage(src);
            this.imageCache.set(src, img);
            return img;
        } catch {
            return null;
        }
    }

    hexToRgb(hex) {
        const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return m
            ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
            : { r: 155, g: 89, b: 182 };
    }

    roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    fillRoundRect(ctx, x, y, w, h, r, style) {
        ctx.fillStyle = style;
        this.roundRect(ctx, x, y, w, h, r);
        ctx.fill();
    }

    strokeRoundRect(ctx, x, y, w, h, r, style, lineWidth = 1) {
        ctx.strokeStyle = style;
        ctx.lineWidth = lineWidth;
        this.roundRect(ctx, x, y, w, h, r);
        ctx.stroke();
    }

    drawCircleImage(ctx, img, cx, cy, radius) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, cx - radius, cy - radius, radius * 2, radius * 2);
        ctx.restore();
    }

    truncateText(ctx, text, maxWidth) {
        if (ctx.measureText(text).width <= maxWidth) return text;
        let truncated = text;
        while (ctx.measureText(truncated + '…').width > maxWidth && truncated.length > 0) {
            truncated = truncated.slice(0, -1);
        }
        return truncated + '…';
    }

    async createProfileCard(data) {
        const {
            user,
            member,
            profile = {},
            xpData = {},
            serverRank = null,
            globalRank = null,
        } = data;

        const theme = profile.color || DEFAULT_THEME;
        const rgb = this.hexToRgb(theme);
        const canvas = createCanvas(WIDTH, HEIGHT);
        const ctx = canvas.getContext('2d');

        // ── 1. Background ─────────────────────────────────
        await this.drawBackground(ctx, profile, rgb);

        this.fillRoundRect(ctx, 0, 0, WIDTH, HEIGHT, CARD_RADIUS, 'rgba(13, 17, 23, 0.85)');
        this.strokeRoundRect(ctx, 0, 0, WIDTH, HEIGHT, CARD_RADIUS, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`, 2);

        await this.drawBanner(ctx, profile, rgb);

        await this.drawAvatar(ctx, user, member, theme, rgb, serverRank, profile);

        this.drawUsername(ctx, user, member);

        this.drawBadges(ctx, xpData, serverRank, globalRank, theme, rgb);
        this.drawXPBar(ctx, xpData, theme, rgb);

        this.drawInfoPanels(ctx, profile, rgb);

        this.drawTipsBadge(ctx, profile, theme);

        await this.drawEmblem(ctx, profile);

        return canvas.toBuffer('image/png');
    }
    async drawBackground(ctx, profile, rgb) {
        if (profile.background) {
            const bgImg = await this.loadImg(profile.background);
            if (bgImg) {
                ctx.save();
                this.roundRect(ctx, 0, 0, WIDTH, HEIGHT, CARD_RADIUS);
                ctx.clip();
                ctx.drawImage(bgImg, 0, 0, WIDTH, HEIGHT);
                ctx.fillStyle = 'rgba(13, 17, 23, 0.6)';
                ctx.fillRect(0, 0, WIDTH, HEIGHT);
                ctx.restore();
                return;
            }
        }

        ctx.save();
        this.roundRect(ctx, 0, 0, WIDTH, HEIGHT, CARD_RADIUS);
        ctx.clip();

        const grad = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
        grad.addColorStop(0, `rgb(${Math.floor(rgb.r * 0.15)}, ${Math.floor(rgb.g * 0.1)}, ${Math.floor(rgb.b * 0.2)})`);
        grad.addColorStop(0.5, 'rgb(13, 17, 23)');
        grad.addColorStop(1, `rgb(${Math.floor(rgb.r * 0.1)}, ${Math.floor(rgb.g * 0.15)}, ${Math.floor(rgb.b * 0.15)})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        ctx.globalAlpha = 0.03;
        for (let i = 0; i < 12; i++) {
            const size = 30 + Math.random() * 80;
            const x = Math.random() * WIDTH;
            const y = Math.random() * HEIGHT;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fillStyle = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    async drawBanner(ctx, profile, rgb) {
        const bannerH = 170;

        ctx.save();
        this.roundRect(ctx, 0, 0, WIDTH, bannerH, CARD_RADIUS);
        ctx.rect(0, bannerH - CARD_RADIUS, WIDTH, CARD_RADIUS);
        ctx.clip();

        if (profile.banner) {
            const bannerImg = await this.loadImg(profile.banner);
            if (bannerImg) {
                ctx.drawImage(bannerImg, 0, 0, WIDTH, bannerH);
                ctx.fillStyle = 'rgba(13, 17, 23, 0.4)';
                ctx.fillRect(0, 0, WIDTH, bannerH);
            } else {
                this.drawDefaultBanner(ctx, rgb, bannerH);
            }
        } else {
            this.drawDefaultBanner(ctx, rgb, bannerH);
        }

        const fadeGrad = ctx.createLinearGradient(0, bannerH - 60, 0, bannerH);
        fadeGrad.addColorStop(0, 'rgba(13, 17, 23, 0)');
        fadeGrad.addColorStop(1, 'rgba(13, 17, 23, 0.95)');
        ctx.fillStyle = fadeGrad;
        ctx.fillRect(0, bannerH - 60, WIDTH, 60);

        ctx.restore();

        ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.4)`;
        ctx.fillRect(30, bannerH, WIDTH - 60, 2);
    }

    drawDefaultBanner(ctx, rgb, h) {
        const grad = ctx.createLinearGradient(0, 0, WIDTH, h);
        grad.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.5)`);
        grad.addColorStop(0.5, `rgba(${Math.floor(rgb.r * 0.6)}, ${Math.floor(rgb.g * 0.6)}, ${Math.floor(rgb.b * 0.6)}, 0.4)`);
        grad.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, WIDTH, h);
    }

    async drawAvatar(ctx, user, member, theme, rgb, serverRank, profile) {
        const avatarRadius = 60;
        const cx = 100;
        const cy = 170;

        ctx.save();
        ctx.shadowColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.6)`;
        ctx.shadowBlur = 25;
        ctx.beginPath();
        ctx.arc(cx, cy, avatarRadius + 5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.01)';
        ctx.fill();
        ctx.restore();

        ctx.beginPath();
        ctx.arc(cx, cy, avatarRadius + 5, 0, Math.PI * 2);
        ctx.strokeStyle = theme;
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx, cy, avatarRadius + 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(13, 17, 23, 1)';
        ctx.fill();

        const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 256 });
        const avatarImg = await this.loadImg(avatarUrl);
        if (avatarImg) {
            this.drawCircleImage(ctx, avatarImg, cx, cy, avatarRadius);
        }

        if (profile.wreath || (serverRank && serverRank <= 10)) {
            const wreathSize = avatarRadius * 2 + 40;
            const wreathImg = profile.wreath
                ? await this.loadImg(profile.wreath)
                : await this.loadImg(path.join(ASSETS_PATH, 'wreath.png'));
            if (wreathImg) {
                ctx.drawImage(wreathImg, cx - wreathSize / 2, cy - wreathSize / 2, wreathSize, wreathSize);
            }
        }

        const statusColors = {
            online: '#43B581',
            idle: '#FAA61A',
            dnd: '#F04747',
            offline: '#747F8D',
        };
        const status = member?.presence?.status || 'offline';
        const dotR = 10;
        const dotX = cx + avatarRadius * Math.cos(Math.PI / 4);
        const dotY = cy + avatarRadius * Math.sin(Math.PI / 4);

        ctx.beginPath();
        ctx.arc(dotX, dotY, dotR + 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(13, 17, 23, 1)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
        ctx.fillStyle = statusColors[status] || statusColors.offline;
        ctx.fill();
    }

    drawUsername(ctx, user, member) {
        const x = 180;
        const y = 200;
        ctx.font = 'bold 28px Montserrat';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'left';
        const displayName = this.truncateText(ctx, member?.displayName || user.username, 350);
        ctx.fillText(displayName, x, y);

        ctx.font = '500 16px Montserrat';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.fillText(`@${user.username}`, x, y + 24);
    }

    drawBadges(ctx, xpData, serverRank, globalRank, theme, rgb) {
        const badgeY = 155;
        let badgeX = WIDTH - 30;

        const badges = [];

        if (globalRank) {
            badges.push({ label: 'GLOBAL', value: `#${globalRank}`, color: 'rgba(255, 255, 255, 0.08)' });
        }

        badges.push({
            label: 'SERVER',
            value: serverRank ? `#${serverRank}` : 'N/A',
            color: 'rgba(255, 255, 255, 0.08)',
        });

        badges.push({
            label: 'LV',
            value: `${xpData.level || 1}`,
            color: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.25)`,
            accent: true,
        });

        badges.forEach((badge) => {
            ctx.font = 'bold 14px Montserrat';
            const valueWidth = ctx.measureText(badge.value).width;
            ctx.font = '500 10px Montserrat';
            const labelWidth = ctx.measureText(badge.label).width;
            const totalWidth = Math.max(valueWidth, labelWidth) + 24;
            const pillHeight = 42;
            const pillX = badgeX - totalWidth;

            this.fillRoundRect(ctx, pillX, badgeY, totalWidth, pillHeight, 10, badge.color);
            if (badge.accent) {
                this.strokeRoundRect(ctx, pillX, badgeY, totalWidth, pillHeight, 10, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.5)`, 1.5);
            }

            ctx.font = 'bold 16px Montserrat';
            ctx.fillStyle = badge.accent ? theme : '#FFFFFF';
            ctx.textAlign = 'center';
            ctx.fillText(badge.value, pillX + totalWidth / 2, badgeY + 20);

            ctx.font = '500 9px Montserrat';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
            ctx.fillText(badge.label, pillX + totalWidth / 2, badgeY + 34);

            badgeX = pillX - 8;
        });
    }

    drawXPBar(ctx, xpData, theme, rgb) {
        const level = xpData.level || 1;
        const xp = xpData.xp || 0;
        const xpForLevel = (lvl) => 5 * (lvl * lvl) + 50 * lvl + 100;
        const maxXP = xpForLevel(level);
        let currentXP = xp;

        let totalXPForPrevLevels = 0;
        for (let i = 1; i < level; i++) {
            totalXPForPrevLevels += xpForLevel(i);
        }
        currentXP = Math.max(0, xp - totalXPForPrevLevels);
        const progress = Math.min(currentXP / maxXP, 1);

        const barX = 180;
        const barY = 240;
        const barW = WIDTH - barX - 40;
        const barH = 16;
        const barR = barH / 2;

        this.fillRoundRect(ctx, barX, barY, barW, barH, barR, 'rgba(255, 255, 255, 0.06)');

        if (progress > 0.01) {
            const fillW = Math.max(barH, barW * progress);
            ctx.save();
            this.roundRect(ctx, barX, barY, fillW, barH, barR);
            ctx.clip();

            const grad = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
            grad.addColorStop(0, theme);
            grad.addColorStop(1, this.lightenColor(rgb, 0.4));
            ctx.fillStyle = grad;
            ctx.fillRect(barX, barY, fillW, barH);

            ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.fillRect(barX, barY, fillW, barH / 2);

            ctx.restore();
        }

        ctx.font = '500 12px Montserrat';
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.fillText(`${this.formatNumber(currentXP)} / ${this.formatNumber(maxXP)} XP`, barX + barW, barY - 6);

        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.fillText(`${Math.round(progress * 100)}%`, barX, barY - 6);
    }

    drawInfoPanels(ctx, profile, rgb) {
        const panelY = 285;
        const panelH = 80;
        const gap = 15;
        const panelRadius = 12;
        const glassColor = 'rgba(255, 255, 255, 0.04)';
        const glassBorder = 'rgba(255, 255, 255, 0.08)';

        const bioX = 30;
        const bioW = WIDTH - 60;
        this.fillRoundRect(ctx, bioX, panelY, bioW, panelH, panelRadius, glassColor);
        this.strokeRoundRect(ctx, bioX, panelY, bioW, panelH, panelRadius, glassBorder);

        ctx.font = 'bold 11px Montserrat';
        ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.8)`;
        ctx.textAlign = 'left';
        ctx.fillText('BIO', bioX + 18, panelY + 22);

        ctx.font = '500 14px Montserrat';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        const bioText = this.truncateText(ctx, profile.bio || 'No bio written.', bioW - 40);
        ctx.fillText(bioText, bioX + 18, panelY + 50);

        const bottomY = panelY + panelH + gap;
        const halfW = (bioW - gap) / 2;

        this.fillRoundRect(ctx, bioX, bottomY, halfW, 70, panelRadius, glassColor);
        this.strokeRoundRect(ctx, bioX, bottomY, halfW, 70, panelRadius, glassBorder);

        ctx.font = 'bold 11px Montserrat';
        ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.8)`;
        ctx.textAlign = 'left';
        ctx.fillText('🎂  BIRTHDAY', bioX + 18, bottomY + 22);

        ctx.font = '500 16px Montserrat';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        const birthdayText = profile.birthday ? this.formatBirthday(profile.birthday) : 'Not set';
        ctx.fillText(birthdayText, bioX + 18, bottomY + 50);

        const balX = bioX + halfW + gap;
        this.fillRoundRect(ctx, balX, bottomY, halfW, 70, panelRadius, glassColor);
        this.strokeRoundRect(ctx, balX, bottomY, halfW, 70, panelRadius, glassBorder);

        ctx.font = 'bold 11px Montserrat';
        ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.8)`;
        ctx.textAlign = 'left';
        ctx.fillText('💰  BALANCE', balX + 18, bottomY + 22);

        const bank = profile.economy?.bank || 0;
        const wallet = profile.economy?.wallet || 0;
        ctx.font = '500 14px Montserrat';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.fillText(`🏦 ${this.formatNumber(bank)}`, balX + 18, bottomY + 48);

        ctx.fillText(`👛 ${this.formatNumber(wallet)}`, balX + halfW / 2 + 10, bottomY + 48);
    }

    drawTipsBadge(ctx, profile, theme) {
        const tipCount = profile.tips?.received || 0;
        const x = WIDTH - 120;
        const y = 12;
        const w = 90;
        const h = 30;

        this.fillRoundRect(ctx, x, y, w, h, 8, 'rgba(0, 0, 0, 0.4)');
        this.strokeRoundRect(ctx, x, y, w, h, 8, 'rgba(255, 255, 255, 0.1)');

        ctx.font = 'bold 12px Montserrat';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255, 215, 0, 0.9)';
        ctx.fillText(`⭐ ${tipCount} TIP${tipCount !== 1 ? 'S' : ''}`, x + w / 2, y + 20);
    }

    async drawEmblem(ctx, profile) {
        if (!profile.emblem) return;
        const emblemImg = await this.loadImg(profile.emblem);
        if (!emblemImg) return;

        const size = 90;
        const x = WIDTH - size - 25;
        const y = HEIGHT - size - 25;

        ctx.globalAlpha = 0.85;
        ctx.drawImage(emblemImg, x, y, size, size);
        ctx.globalAlpha = 1;
    }

    lightenColor(rgb, amount) {
        const r = Math.min(255, Math.floor(rgb.r + (255 - rgb.r) * amount));
        const g = Math.min(255, Math.floor(rgb.g + (255 - rgb.g) * amount));
        const b = Math.min(255, Math.floor(rgb.b + (255 - rgb.b) * amount));
        return `rgb(${r}, ${g}, ${b})`;
    }

    formatNumber(n) {
        if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
        if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
        return n.toLocaleString();
    }

    formatBirthday(birthday) {
        if (!birthday) return 'Not set';
        const [day, month] = birthday.split('-');
        const months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const d = parseInt(day);
        return `${d}${this.getOrdinal(d)} ${months[parseInt(month)] || month}`;
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
    ProfileCanvas: profileCanvas,
};