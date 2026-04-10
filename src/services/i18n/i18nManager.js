const fs = require('fs');
const path = require('path');
const i18next = require('i18next');
const vi = require('../../locales/vi.json');
const en = require('../../locales/en.json');
const emojis = require('../../config/emojis');
const logger = require('../../utils/logger');

const SRC_DIR = path.join(__dirname, '../..');

// Các thư mục cần loại.
const SCAN_EXCLUDED_DIRS = [
    path.join(SRC_DIR, 'locales'),
    path.join(SRC_DIR, 'services', 'i18n'),
];

// Khớp các dạng: interaction.t('key'), message.t('key'), i.t('key'), interactionOrMessage?.t('key')
// Chỉ lấy khóa chuỗi tĩnh (bỏ qua template literal có nội suy ${})
const TRANSLATION_KEY_REGEX = /\b[A-Za-z_$][\w$]*(?:\?\.|\.)t\(\s*['"]([\w.]+)['"]/g;

// Tài nguyên locale dùng cho bước kiểm tra.
const LOCALES = { vi, en };

class I18nManager {
    constructor() {
        this.isInitialized = false;
    }

    async init() {
        if (this.isInitialized) return;

        try {
            await i18next.init({
                lng: 'vi',
                fallbackLng: 'vi',
                resources: {
                    vi: { translation: vi },
                    en: { translation: en },
                },
                interpolation: {
                    escapeValue: false, // Không cần cho Discord.
                },
            });
            this.verifyTranslationsOnStart();
            this.isInitialized = true;
            logger.info('i18n', 'Initialized multi-language system');
        } catch (error) {
            logger.error('i18n', 'Error initializing i18next:', error);
        }
    }

    verifyTranslationsOnStart() {
        if (process.env.I18N_VERIFY_ON_START !== 'true' || !this.isDevMode()) {
            return;
        }

        const startTime = Date.now();
        const results = this.runFullVerification();
        const elapsed = Date.now() - startTime;

        if (results.totalIssues === 0) {
            logger.info('i18n', `Verification passed in ${elapsed}ms — ${results.totalKeysScanned} keys across ${results.filesScanned} files, locale parity OK`);
            return;
        }

        // Báo cáo khóa bị thiếu (được dùng trong code nhưng không có trong file locale)
        for (const item of results.missingKeys) {
            logger.warn('i18n', `Missing key [${item.locale.toUpperCase()}]: "${item.key}" — used in ${item.files.join(', ')}`);
        }

        // Báo cáo lệch cấu trúc locale (khóa có ở locale này nhưng thiếu ở locale kia)
        for (const item of results.parityMismatches) {
            logger.warn('i18n', `Locale parity mismatch: "${item.key}" exists in ${item.presentIn.toUpperCase()} but missing in ${item.missingIn.toUpperCase()}`);
        }

        logger.warn('i18n', `Verification completed in ${elapsed}ms — ${results.totalIssues} issue(s) found`);

        if (process.env.I18N_STRICT === 'true') {
            throw new Error(`I18n verification failed with ${results.totalIssues} issue(s).`);
        }
    }

    /**
     * Chạy toàn bộ quy trình kiểm tra i18n:
     * 1. Quét mã nguồn để tìm các khóa dịch được sử dụng
     * 2. Kiểm tra từng khóa có tồn tại trong mọi file locale
     * 3. So sánh cấu trúc các file locale để đảm bảo đồng bộ khóa
     * @returns {{ missingKeys: Array, parityMismatches: Array, totalIssues: number, totalKeysScanned: number, filesScanned: number }}
     */
    runFullVerification() {
        const keyUsageMap = this.collectKeyUsage();

        const missingKeys = [];
        for (const [key, files] of keyUsageMap) {
            for (const [locale, resource] of Object.entries(LOCALES)) {
                if (this.resolveKey(resource, key) === undefined) {
                    missingKeys.push({ locale, key, files: files.map(f => path.relative(process.cwd(), f)) });
                }
            }
        }

        const parityMismatches = this.checkLocaleParity();

        const filesScanned = new Set();
        for (const files of keyUsageMap.values()) {
            for (const f of files) filesScanned.add(f);
        }

        return {
            missingKeys,
            parityMismatches,
            totalIssues: missingKeys.length + parityMismatches.length,
            totalKeysScanned: keyUsageMap.size,
            filesScanned: filesScanned.size,
        };
    }

    /**
     * Quét toàn bộ file JS trong các thư mục đã cấu hình và thu thập
     * @returns {Map<string, string[]>} key → [đường dẫn file]
     */
    collectKeyUsage() {
        const keyMap = new Map(); // key → Set<đường dẫn file>

        if (!fs.existsSync(SRC_DIR)) {
            return new Map();
        }

        const files = this.getJsFiles(SRC_DIR);
        for (const file of files) {
            if (this.isExcludedPath(file)) {
                continue;
            }

            const content = this.stripComments(fs.readFileSync(file, 'utf8'));
            let match;

            while ((match = TRANSLATION_KEY_REGEX.exec(content)) !== null) {
                const key = match[1];
                if (!keyMap.has(key)) keyMap.set(key, new Set());
                keyMap.get(key).add(file);
            }

            TRANSLATION_KEY_REGEX.lastIndex = 0;
        }

        // Chuyển Set sang Array để dễ sử dụng hơn
        const result = new Map();
        for (const [key, files] of keyMap) {
            result.set(key, [...files]);
        }
        return result;
    }

    /**
     * So sánh cấu trúc khóa giữa các file locale với nhau.
     * Phát hiện các khóa có ở locale này nhưng thiếu ở locale khác.
     * @returns {Array<{ key: string, presentIn: string, missingIn: string }>}
     */
    checkLocaleParity() {
        const mismatches = [];
        const localeEntries = Object.entries(LOCALES);

        const flatKeysByLocale = {};
        for (const [locale, resource] of localeEntries) {
            flatKeysByLocale[locale] = new Set(this.flattenKeys(resource));
        }

        // So sánh chéo từng cặp locale
        for (let i = 0; i < localeEntries.length; i++) {
            for (let j = 0; j < localeEntries.length; j++) {
                if (i === j) continue;
                const [localeA] = localeEntries[i];
                const [localeB] = localeEntries[j];

                for (const key of flatKeysByLocale[localeA]) {
                    if (!flatKeysByLocale[localeB].has(key)) {
                        mismatches.push({ key, presentIn: localeA, missingIn: localeB });
                    }
                }
            }
        }

        return mismatches;
    }

    /**
     * Thu thập đệ quy toàn bộ file .js từ một thư mục.
     */
    getJsFiles(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const files = [];

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                files.push(...this.getJsFiles(fullPath));
            } else if (entry.isFile() && entry.name.endsWith('.js')) {
                files.push(fullPath);
            }
        }

        return files;
    }

    isExcludedPath(filePath) {
        return SCAN_EXCLUDED_DIRS.some(excludedDir => {
            const relative = path.relative(excludedDir, filePath);
            return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
        });
    }

    stripComments(content) {
        return content
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\/\/.*$/gm, '');
    }

    /**
     * Phân giải đường dẫn khóa dạng chấm trên một object lồng nhau.
     * @returns {*} Giá trị tại đường dẫn khóa, hoặc undefined nếu không tìm thấy.
     */
    resolveKey(resource, fullKey) {
        return fullKey.split('.').reduce((current, part) => current?.[part], resource);
    }

    /**
     * Làm phẳng object lồng nhau thành mảng đường dẫn khóa dạng chấm.
     * Chỉ bao gồm giá trị lá (chuỗi), không gồm object trung gian.
     */
    flattenKeys(obj, prefix = '') {
        const keys = [];
        for (const [key, value] of Object.entries(obj)) {
            const fullKey = prefix ? `${prefix}.${key}` : key;
            if (typeof value === 'object' && value !== null) {
                keys.push(...this.flattenKeys(value, fullKey));
            } else {
                keys.push(fullKey);
            }
        }
        return keys;
    }

    isDevMode() {
        return process.env.NODE_ENV === 'development' || process.env.npm_lifecycle_event === 'dev';
    }

    /**
     * Dịch một khóa theo locale được chỉ định.
     * @param {string} key - Khóa bản dịch (đường dẫn dạng chấm)
     * @param {string} locale - Mã ngôn ngữ (vi, en)
     * @param {object} options - Biến nội suy
     * @returns {string} Chuỗi đã dịch
     */
    t(key, locale = 'vi', options = {}) {
        if (!this.isInitialized) return key;
        const translator = i18next.getFixedT(locale);
        return translator(key, {
            ...options,
            _emoji: emojis,
        });
    }
}

module.exports = new I18nManager();