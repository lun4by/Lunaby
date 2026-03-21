/**
 * Các tiện ích bảo mật để bảo vệ chống lại Prompt Injection và Memory Poisoning.
 */

const MAX_INPUT_LENGTH = 2000;
const MAX_MEMORY_LENGTH = 500;

const INJECTION_PATTERNS = [
  /ignore( all)? previous (instructions|prompts|rules)/i,
  /forget( all)? previous (instructions|prompts|rules)/i,
  /disregard( all)? previous/i,
  /you are now/i,
  /system prompt/i,
  /system:/i,
  /assistant:/i,
  /new rule:/i,
  /<\|system\|>/i,
  /<\|user\|>/i
];

class SecurityUtils {
  /**
   * Làm sạch đầu vào của người dùng để ngăn chặn prompt injection.
   * - Cắt bỏ văn bản dài quá mức.
   * - Loại bỏ các mẫu injection độc hại đã biết.
   */
  sanitizeInput(text) {
    if (!text || typeof text !== 'string') return '';

    let sanitized = text.substring(0, MAX_INPUT_LENGTH);

    for (const pattern of INJECTION_PATTERNS) {
      sanitized = sanitized.replace(pattern, '[REDACTED_SYSTEM_OVERRIDE]');
    }

    return sanitized.trim();
  }

  /**
   * Xác thực nội dung dành cho bộ nhớ người dùng để ngăn chặn Memory Poisoning.
   * - Từ chối nội dung chứa các mẫu injection.
   * - Từ chối các mẩu trí nhớ quá dài.
   * @returns {Object} { isValid: boolean, reason?: string }
   */
  validateMemoryContent(content) {
    if (!content || typeof content !== 'string') return { isValid: false, reason: 'Invalid format' };

    if (content.length > MAX_MEMORY_LENGTH) {
      return { isValid: false, reason: 'Memory chunk too large' };
    }

    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(content)) {
        return { isValid: false, reason: 'Detected system override terminology - Potential Memory Poisoning' };
      }
    }

    return { isValid: true };
  }
}

module.exports = new SecurityUtils();