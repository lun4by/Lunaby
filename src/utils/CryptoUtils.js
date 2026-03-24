const crypto = require('crypto');

/**
 * Tiện ích cho mã hóa và giải mã AES-256-CBC.
 * Được sử dụng để bảo vệ PII (Thông tin cá nhân có thể nhận dạng) trong cơ sở dữ liệu.
 */

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // Đối với AES, giá trị này luôn là 16

// Thử lấy khóa từ biến môi trường, dùng khóa dẫn xuất nếu thiếu (không khuyến nghị cho production)
const ENCRYPTION_KEY = process.env.LUNABY_ENCRYPTION_KEY
  ? Buffer.from(process.env.LUNABY_ENCRYPTION_KEY, 'hex')
  : crypto.scryptSync(process.env.LUNABY_API_KEY || 'lunaby-default-salt', 'salt', 32);

class CryptoUtils {
  /**
   * Mã hóa văn bản thuần túy thành chuỗi hex phân tách bằng dấu hai chấm (iv:encryptedData).
   * @param {string} text - Văn bản cần mã hóa.
   * @returns {string} - Chuỗi đã mã hóa định dạng 'iv:data'.
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
      return text; // Trả về văn bản gốc nếu mã hóa thất bại để tránh mất dữ liệu
    }
  }

  /**
   * Giải mã chuỗi hex phân tách bằng dấu hai chấm trở lại văn bản thuần túy.
   * @param {string} text - Chuỗi đã mã hóa định dạng 'iv:data'.
   * @returns {string} - Văn bản đã giải mã.
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
      // Nếu giải mã thất bại, có thể là văn bản gốc hoặc dùng sai khóa
      return text;
    }
  }

  /**
   * Kiểm tra xem chuỗi có định dạng đã mã hóa hay không (iv:hex).
   */
  isEncrypted(text) {
    if (typeof text !== 'string') return false;
    const parts = text.split(':');
    return parts.length === 2 && parts[0].length === (IV_LENGTH * 2);
  }
}

module.exports = new CryptoUtils();