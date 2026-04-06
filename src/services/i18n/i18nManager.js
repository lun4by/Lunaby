const i18next = require('i18next');
const vi = require('../../locales/vi.json');
const en = require('../../locales/en.json');
const logger = require('../../utils/logger');

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
            this.isInitialized = true;
            logger.info('i18n', 'Đã khởi tạo hệ thống đa ngôn ngữ');
        } catch (error) {
            logger.error('i18n', 'Lỗi khởi tạo i18next', error);
        }
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
