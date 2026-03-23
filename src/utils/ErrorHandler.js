const logger = require('./logger');

class ErrorHandler {
  static ERROR_CATEGORIES = {
    VALIDATION: 'validation',
    DATABASE: 'database',
    API: 'api',
    PERMISSION: 'permission',
    TIMEOUT: 'timeout',
    NETWORK: 'network',
    UNKNOWN: 'unknown'
  };

  static categorizeError(error) {
    if (!error) return this.ERROR_CATEGORIES.UNKNOWN;

    const message = error.message ? error.message.toLowerCase() : '';
    const code = error.code || '';

    if (message.includes('invalid') || message.includes('validation') || message.includes('không hợp lệ')) {
      return this.ERROR_CATEGORIES.VALIDATION;
    }

    if (message.includes('database') || message.includes('mongodb') || message.includes('collection')) {
      return this.ERROR_CATEGORIES.DATABASE;
    }

    if (code === 'EPROTO' || code === 'ECONNREFUSED' || code === 'ENOTFOUND' ||
      message.includes('connect') || message.includes('kết nối')) {
      return this.ERROR_CATEGORIES.NETWORK;
    }

    if (code === 'ECONNABORTED' || code === 'ETIMEDOUT' ||
      message.includes('timeout') || message.includes('hết thời gian')) {
      return this.ERROR_CATEGORIES.TIMEOUT;
    }

    if (code === 50013 || message.includes('permission') || message.includes('quyền')) {
      return this.ERROR_CATEGORIES.PERMISSION;
    }

    if (error.response || message.includes('api') || message.includes('provider')) {
      return this.ERROR_CATEGORIES.API;
    }

    return this.ERROR_CATEGORIES.UNKNOWN;
  }

  static getUserFriendlyMessage(error, context = '') {
    const category = this.categorizeError(error);
    const message = error.message || 'Đã xảy ra lỗi không xác định';

    switch (category) {
      case this.ERROR_CATEGORIES.VALIDATION:
        return 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại thông tin.';

      case this.ERROR_CATEGORIES.DATABASE:
        return 'Lỗi cơ sở dữ liệu. Vui lòng thử lại sau.';

      case this.ERROR_CATEGORIES.NETWORK:
        return 'Không thể kết nối đến server. Vui lòng kiểm tra kết nối mạng.';

      case this.ERROR_CATEGORIES.TIMEOUT:
        return 'Yêu cầu mất quá nhiều thời gian. Vui lòng thử lại với nội dung ngắn gọn hơn.';

      case this.ERROR_CATEGORIES.PERMISSION:
        return 'Bot không có quyền thực hiện hành động này.';

      case this.ERROR_CATEGORIES.API:
        if (message.includes('vi phạm') || message.includes('không phù hợp')) {
          return 'Nội dung vi phạm chính sách an toàn. Vui lòng thử với nội dung khác.';
        }
        if (message.includes('bận') || message.includes('busy')) {
          return 'Hệ thống AI đang bận. Vui lòng thử lại sau vài giây.';
        }
        if (message.includes('401') || message.includes('403') || message.includes('xác thực')) {
          return 'Lỗi xác thực API. Vui lòng liên hệ quản trị viên.';
        }
        if (message.includes('429') || message.includes('rate limit')) {
          return 'Đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.';
        }
        return 'Lỗi từ hệ thống AI. Vui lòng thử lại sau.';

      default:
        if (context) {
          return `Xin lỗi, tôi gặp lỗi khi ${context}. Vui lòng thử lại sau.`;
        }
        return 'Xin lỗi, đã xảy ra lỗi. Vui lòng thử lại sau.';
    }
  }

  static logError(context, message, error, level = 'error') {
    const errorInfo = {
      context,
      category: this.categorizeError(error),
      message: error?.message || message,
      code: error?.code,
      stack: error?.stack
    };
    logger[level === 'warn' ? 'warn' : 'error'](context, message, errorInfo);
  }

  static handleAsyncError(context, operation) {
    return async (...args) => {
      try {
        return await operation(...args);
      } catch (error) {
        this.logError(context, `Error in ${operation.name}`, error);
        throw error;
      }
    };
  }

  static wrapWithErrorHandling(context, operation, defaultValue = null) {
    return async (...args) => {
      try {
        return await operation(...args);
      } catch (error) {
        this.logError(context, `Error in ${operation.name}`, error);
        return defaultValue;
      }
    };
  }

  static createDetailedError(message, details = {}) {
    const error = new Error(message);
    error.details = details;
    return error;
  }

  static isRecoverableError(error) {
    const { TIMEOUT, NETWORK, API } = this.ERROR_CATEGORIES;
    return [TIMEOUT, NETWORK, API].includes(this.categorizeError(error));
  }

  static async retryOperation(operation, maxRetries = 3, delayMs = 1000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (!this.isRecoverableError(error) || attempt === maxRetries) throw error;
        logger.warn('RETRY', `Attempt ${attempt}/${maxRetries} failed, retrying in ${delayMs * attempt}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
      }
    }
  }
}

module.exports = ErrorHandler;