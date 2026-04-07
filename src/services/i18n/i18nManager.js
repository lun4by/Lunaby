const fs = require('fs');
const path = require('path');
const i18next = require('i18next');
const vi = require('../../locales/vi.json');
const en = require('../../locales/en.json');
const logger = require('../../utils/logger');

const COMMANDS_DIR = path.join(__dirname, '../../commands');
const TRANSLATION_KEY_REGEX = /interaction\.t\(['"]([\w_.]+)['"]/g;

class I18nManager {
    constructor() {
        this.isInitialized = false;
    }

    async init() {
        if (this.isInitialized) return;
        
        try {
            await i18next.init({
                lng: 'vi', // Ngôn ngữ mặc định
                fallbackLng: 'vi', // Fallback nếu từ khoá không tìm thấy
                resources: {
                    vi: { translation: vi },
                    en: { translation: en }
                },
                interpolation: {
                    escapeValue: false // Không cần thiết với Discord (thường dùng cho HTML/React để chống XSS)
                }
            });
            this.verifyTranslationsOnStart();
            this.isInitialized = true;
            logger.info('i18n', 'Initialized multi-language system');
        } catch (error) {
            logger.error('i18n', 'Error khởi tạo i18next', error);
        }
    }

    verifyTranslationsOnStart() {
        if (process.env.I18N_VERIFY_ON_START !== 'true' || !this.isDevMode()) {
            return;
        }

        const missingKeys = this.collectMissingTranslationKeys();
        if (missingKeys.length === 0) {
            logger.info('i18n', 'I18n verification passed: no missing translation keys in command files');
            return;
        }

        for (const item of missingKeys) {
            logger.warn('i18n', `Missing translation key in ${item.locale.toUpperCase()}: ${item.key} (${item.file})`);
        }

        if (process.env.I18N_STRICT === 'true') {
            throw new Error(`I18n verification failed with ${missingKeys.length} missing translation key(s).`);
        }
    }

    isDevMode() {
        return process.env.NODE_ENV === 'development' || process.env.npm_lifecycle_event === 'dev';
    }

    collectMissingTranslationKeys() {
        const commandFiles = this.getCommandFiles(COMMANDS_DIR);
        const foundKeys = new Map();
        const missingKeys = [];

        for (const file of commandFiles) {
            const content = fs.readFileSync(file, 'utf8');
            let match;

            while ((match = TRANSLATION_KEY_REGEX.exec(content)) !== null) {
                foundKeys.set(match[1], file);
            }

            TRANSLATION_KEY_REGEX.lastIndex = 0;
        }

        for (const [fullKey, file] of foundKeys) {
            if (this.resolveTranslationKey(vi, fullKey) === undefined) {
                missingKeys.push({ locale: 'vi', key: fullKey, file: path.relative(process.cwd(), file) });
            }

            if (this.resolveTranslationKey(en, fullKey) === undefined) {
                missingKeys.push({ locale: 'en', key: fullKey, file: path.relative(process.cwd(), file) });
            }
        }

        return missingKeys;
    }

    getCommandFiles(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const files = [];

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                files.push(...this.getCommandFiles(fullPath));
                continue;
            }

            if (entry.isFile() && entry.name.endsWith('.js')) {
                files.push(fullPath);
            }
        }

        return files;
    }

    resolveTranslationKey(resource, fullKey) {
        return fullKey.split('.').reduce((current, part) => current?.[part], resource);
    }

    /**
     * Dịch text
     * @param {string} key Từ khoá
     * @param {string} locale Mã ngôn ngữ (vi, en)
     * @param {object} options Biến truyền vào
     * @returns {string} Kết quả dịch
     */
    t(key, locale = 'vi', options = {}) {
        if (!this.isInitialized) return key; // Safety fallback
        
        // Tạo clone i18n instance với locale được chỉ định, hoặc ghi đè lng
        // Thường i18next hỗ trợ đổi ngôn ngữ qua i18next.getFixedT
        const translator = i18next.getFixedT(locale);
        return translator(key, options);
    }
}

module.exports = new I18nManager();
