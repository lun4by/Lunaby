const fs = require('fs');
const path = require('path');
const i18next = require('i18next');
const vi = require('../../locales/vi.json');
const en = require('../../locales/en.json');
const emojis = require('../../config/emojis');
const logger = require('../../utils/logger');

const SRC_DIR = path.join(__dirname, '../..');

// Directories to exclude from translation scan.
const SCAN_EXCLUDED_DIRS = [
    path.join(SRC_DIR, 'locales'),
    path.join(SRC_DIR, 'services', 'i18n'),
];

// Matches: interaction.t('key'), message.t('key'), i.t('key'), interactionOrMessage?.t('key')
// Captures static string keys only (ignores template literals with ${} interpolation)
const TRANSLATION_KEY_REGEX = /\b[A-Za-z_$][\w$]*(?:\?\.|\.)t\(\s*['"]([\w.]+)['"]/g;

// Available locale resources for verification
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
                    escapeValue: false, // Not needed for Discord (used in HTML/React for XSS prevention)
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

        // Report missing keys (key used in code but absent in locale file)
        for (const item of results.missingKeys) {
            logger.warn('i18n', `Missing key [${item.locale.toUpperCase()}]: "${item.key}" — used in ${item.files.join(', ')}`);
        }

        // Report locale structure mismatches (key exists in one locale but not the other)
        for (const item of results.parityMismatches) {
            logger.warn('i18n', `Locale parity mismatch: "${item.key}" exists in ${item.presentIn.toUpperCase()} but missing in ${item.missingIn.toUpperCase()}`);
        }

        logger.warn('i18n', `Verification completed in ${elapsed}ms — ${results.totalIssues} issue(s) found`);

        if (process.env.I18N_STRICT === 'true') {
            throw new Error(`I18n verification failed with ${results.totalIssues} issue(s).`);
        }
    }

    /**
     * Runs a full i18n verification pass:
     * 1. Scans source files for translation key usage
     * 2. Checks each key exists in all locale files
     * 3. Compares locale file structures for key parity
     * @returns {{ missingKeys: Array, parityMismatches: Array, totalIssues: number, totalKeysScanned: number, filesScanned: number }}
     */
    runFullVerification() {
        // Phase 1: Collect all translation keys from source code
        const keyUsageMap = this.collectKeyUsage();

        // Phase 2: Check each used key against all locale resources
        const missingKeys = [];
        for (const [key, files] of keyUsageMap) {
            for (const [locale, resource] of Object.entries(LOCALES)) {
                if (this.resolveKey(resource, key) === undefined) {
                    missingKeys.push({ locale, key, files: files.map(f => path.relative(process.cwd(), f)) });
                }
            }
        }

        // Phase 3: Structural parity check between locale files
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
     * Scans all JS files in configured directories and collects
     * translation keys mapped to the files where they are used.
     * @returns {Map<string, string[]>} key → [file paths]
     */
    collectKeyUsage() {
        const keyMap = new Map(); // key → Set<filePath>

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

        // Convert Sets to Arrays for easier consumption
        const result = new Map();
        for (const [key, files] of keyMap) {
            result.set(key, [...files]);
        }
        return result;
    }

    /**
     * Compares the key structures of all locale files against each other.
     * Detects keys that exist in one locale but are missing in another.
     * @returns {Array<{ key: string, presentIn: string, missingIn: string }>}
     */
    checkLocaleParity() {
        const mismatches = [];
        const localeEntries = Object.entries(LOCALES);

        // Flatten each locale into a set of dot-paths
        const flatKeysByLocale = {};
        for (const [locale, resource] of localeEntries) {
            flatKeysByLocale[locale] = new Set(this.flattenKeys(resource));
        }

        // Cross-compare every pair
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
     * Recursively collects all .js files from a directory.
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
     * Resolves a dot-separated key path against a nested object.
     * @returns {*} The value at the key path, or undefined if not found.
     */
    resolveKey(resource, fullKey) {
        return fullKey.split('.').reduce((current, part) => current?.[part], resource);
    }

    /**
     * Flattens a nested object into an array of dot-separated key paths.
     * Only includes leaf (string) values, not intermediate objects.
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
     * Translate a key to the specified locale.
     * @param {string} key - Translation key (dot-separated path)
     * @param {string} locale - Language code (vi, en)
     * @param {object} options - Interpolation variables
     * @returns {string} Translated string
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