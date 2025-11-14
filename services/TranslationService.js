const axios = require("axios");
const logger = require("../utils/logger.js");

/**
 * Translation Service
 * AI-powered translation with 100+ language support
 */
class TranslationService {
  constructor() {
    this.lunabyBaseURL = process.env.LUNABY_BASE_URL || "https://api.lunie.dev/v1";
    this.lunabyApiKey = process.env.LUNABY_API_KEY;
    
    // Common language codes
    this.languages = {
      "vi": "Vietnamese",
      "en": "English",
      "ja": "Japanese",
      "ko": "Korean",
      "zh": "Chinese",
      "es": "Spanish",
      "fr": "French",
      "de": "German",
      "ru": "Russian",
      "th": "Thai",
      "id": "Indonesian",
      "pt": "Portuguese",
      "it": "Italian",
      "ar": "Arabic",
      "hi": "Hindi",
      "tr": "Turkish",
      "pl": "Polish",
      "nl": "Dutch",
      "sv": "Swedish",
      "fi": "Finnish",
    };
  }

  /**
   * Translate text to target language
   */
  async translate(text, targetLang, sourceLang = "auto") {
    try {
      logger.info("TRANSLATION", `Translating to ${targetLang}`);
      
      const targetLanguage = this.getLanguageName(targetLang);
      let prompt;
      
      if (sourceLang === "auto") {
        prompt = `Translate the following text to ${targetLanguage}. Provide only the translation without explanations:\n\n${text}`;
      } else {
        const sourceLanguage = this.getLanguageName(sourceLang);
        prompt = `Translate the following text from ${sourceLanguage} to ${targetLanguage}. Provide only the translation without explanations:\n\n${text}`;
      }
      
      const response = await axios.post(
        `${this.lunabyBaseURL}/chat/completions`,
        {
          model: "lunaby-pro",
          messages: [
            {
              role: "system",
              content: "You are a professional translator. Provide accurate translations maintaining the original tone and meaning. Output only the translated text.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          max_tokens: 2048,
          temperature: 0.3,
        },
        {
          headers: {
            "Authorization": `Bearer ${this.lunabyApiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 30000,
        }
      );
      
      const translation = response.data.choices[0].message.content.trim();
      
      logger.info("TRANSLATION", "Translation completed");
      
      return {
        success: true,
        originalText: text,
        translatedText: translation,
        sourceLang: sourceLang === "auto" ? "detected" : sourceLang,
        targetLang,
      };
    } catch (error) {
      logger.error("TRANSLATION", `Translation error: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Detect language of text
   */
  async detectLanguage(text) {
    try {
      logger.info("TRANSLATION", "Detecting language");
      
      const prompt = `Detect the language of this text and respond with only the language name in English:\n\n${text}`;
      
      const response = await axios.post(
        `${this.lunabyBaseURL}/chat/completions`,
        {
          model: "lunaby-pro",
          messages: [
            {
              role: "system",
              content: "You are a language detection system. Respond with only the language name.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          max_tokens: 50,
          temperature: 0.1,
        },
        {
          headers: {
            "Authorization": `Bearer ${this.lunabyApiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 15000,
        }
      );
      
      const detectedLanguage = response.data.choices[0].message.content.trim();
      const langCode = this.getLanguageCode(detectedLanguage);
      
      return {
        success: true,
        language: detectedLanguage,
        code: langCode,
      };
    } catch (error) {
      logger.error("TRANSLATION", `Language detection error: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Translate to multiple languages at once
   */
  async translateMultiple(text, targetLangs) {
    try {
      logger.info("TRANSLATION", `Translating to ${targetLangs.length} languages`);
      
      const translations = await Promise.all(
        targetLangs.map(lang => this.translate(text, lang))
      );
      
      return {
        success: true,
        original: text,
        translations: translations.filter(t => t.success),
      };
    } catch (error) {
      logger.error("TRANSLATION", `Multiple translation error: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get explanation of translation
   */
  async explainTranslation(originalText, translatedText, sourceLang, targetLang) {
    try {
      logger.info("TRANSLATION", "Generating translation explanation");
      
      const sourceLanguage = this.getLanguageName(sourceLang);
      const targetLanguage = this.getLanguageName(targetLang);
      
      const prompt = `Explain this translation from ${sourceLanguage} to ${targetLanguage}. Include:
1. Literal meaning
2. Cultural context if relevant
3. Notable translation choices

Original (${sourceLanguage}): ${originalText}
Translation (${targetLanguage}): ${translatedText}`;
      
      const response = await axios.post(
        `${this.lunabyBaseURL}/chat/completions`,
        {
          model: "lunaby-pro",
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          max_tokens: 1024,
        },
        {
          headers: {
            "Authorization": `Bearer ${this.lunabyApiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 30000,
        }
      );
      
      const explanation = response.data.choices[0].message.content;
      
      return {
        success: true,
        explanation,
      };
    } catch (error) {
      logger.error("TRANSLATION", `Explanation error: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get language name from code
   */
  getLanguageName(code) {
    return this.languages[code.toLowerCase()] || code;
  }

  /**
   * Get language code from name
   */
  getLanguageCode(name) {
    const lowerName = name.toLowerCase();
    for (const [code, langName] of Object.entries(this.languages)) {
      if (langName.toLowerCase() === lowerName) {
        return code;
      }
    }
    return null;
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages() {
    return Object.entries(this.languages).map(([code, name]) => ({
      code,
      name,
    }));
  }

  /**
   * Format translation for Discord
   */
  formatTranslation(result) {
    if (!result.success) {
      return `❌ Translation failed: ${result.error}`;
    }
    
    return `🌐 **Translation**\n\`\`\`\n${result.translatedText}\n\`\`\`\n*${result.sourceLang} → ${result.targetLang}*`;
  }
}

module.exports = new TranslationService();
