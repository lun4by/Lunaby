const crypto = require('crypto');

/**
 * Utility for AES-256-CBC encryption and decryption.
 * Used to protect PII (Personally Identifiable Information) in the database.
 */

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // For AES, this is always 16

// Try to get key from environment, fallback to a derived key if missing (not recommended for production)
const ENCRYPTION_KEY = process.env.LUNABY_ENCRYPTION_KEY 
  ? Buffer.from(process.env.LUNABY_ENCRYPTION_KEY, 'hex') 
  : crypto.scryptSync(process.env.LUNABY_API_KEY || 'lunaby-default-salt', 'salt', 32);

class CryptoUtils {
  /**
   * Encrypts plain text into a colon-separated hex string (iv:encryptedData).
   * @param {string} text - The text to encrypt.
   * @returns {string} - The encrypted string format 'iv:data'.
   */
  encrypt(text) {
    if (!text) return text;
    try {
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
      let encrypted = cipher.update(text);
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      return iv.toString('hex') + ':' + encrypted.toString('hex');
    } catch (error) {
      console.error('Encryption error:', error);
      return text; // Fallback to plain text if encryption fails to prevent data loss
    }
  }

  /**
   * Decrypts a colon-separated hex string back to plain text.
   * @param {string} text - The encrypted string format 'iv:data'.
   * @returns {string} - The decrypted text.
   */
  decrypt(text) {
    if (!text || !text.includes(':')) return text;
    try {
      const textParts = text.split(':');
      const iv = Buffer.from(textParts.shift(), 'hex');
      const encryptedText = Buffer.from(textParts.join(':'), 'hex');
      const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
      let decrypted = decipher.update(encryptedText);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      return decrypted.toString();
    } catch (error) {
      // If decryption fails, it might be plain text or using a different key
      return text; 
    }
  }

  /**
   * Checks if a string looks like it's encrypted (iv:hex).
   */
  isEncrypted(text) {
    if (typeof text !== 'string') return false;
    const parts = text.split(':');
    return parts.length === 2 && parts[0].length === (IV_LENGTH * 2);
  }
}

module.exports = new CryptoUtils();
