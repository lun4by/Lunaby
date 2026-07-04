const crypto = require('crypto');
const logger = require('../core/logger');

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;
const ENCRYPTION_KEY_HEX = process.env.LUNABY_ENCRYPTION_KEY?.trim() || '';

let encryptionKey = null;
let encryptionError = null;

if (!ENCRYPTION_KEY_HEX) {
  encryptionError = 'LUNABY_ENCRYPTION_KEY is not configured.';
} else if (!/^[0-9a-fA-F]{64}$/.test(ENCRYPTION_KEY_HEX)) {
  encryptionError = 'LUNABY_ENCRYPTION_KEY must be a 64-character hex string (32 bytes).';
} else {
  encryptionKey = Buffer.from(ENCRYPTION_KEY_HEX, 'hex');
}

if (encryptionError) {
  logger.error('crypto', `Unsafe encryption configuration: ${encryptionError}`);
}

class CryptoUtils {
  ensureEncryptionReady() {
    if (!encryptionKey) {
      throw new Error(encryptionError || 'Encryption key is unavailable.');
    }
  }

  encrypt(text) {
    if (!text) return text;

    this.ensureEncryptionReady();

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey, iv);
    let encrypted = cipher.update(text, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
  }

  decrypt(text) {
    if (!text) return text;
    if (!this.isEncrypted(text)) return text;

    this.ensureEncryptionReady();

    const [ivHex, encryptedHex] = text.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const encryptedText = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
  }

  isEncrypted(text) {
    if (typeof text !== 'string') return false;

    const parts = text.split(':');
    return parts.length === 2
      && parts[0].length === IV_LENGTH * 2
      && /^[0-9a-fA-F]+$/.test(parts[0])
      && /^[0-9a-fA-F]+$/.test(parts[1]);
  }
}

module.exports = new CryptoUtils();