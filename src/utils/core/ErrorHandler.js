const logger = require("./logger");

class ErrorHandler {
  static ERROR_CATEGORIES = {
    VALIDATION: "validation",
    DATABASE: "database",
    API: "api",
    PERMISSION: "permission",
    TIMEOUT: "timeout",
    NETWORK: "network",
    UNKNOWN: "unknown",
  };

  static categorizeError(error) {
    if (!error) return this.ERROR_CATEGORIES.UNKNOWN;

    const message = typeof error.message === "string" ? error.message.toLowerCase() : "";
    const code = error.code || "";
    const { status } = this.extractApiErrorInfo(error);

    if (status === 400 || status === 422) {
      return this.ERROR_CATEGORIES.VALIDATION;
    }

    if (status === 408 || status === 504) {
      return this.ERROR_CATEGORIES.TIMEOUT;
    }

    if (status >= 400) {
      return this.ERROR_CATEGORIES.API;
    }

    if (message.includes("không hợp lệ")) {
      return this.ERROR_CATEGORIES.VALIDATION;
    }

    if (message.includes("database") || message.includes("mongodb") || message.includes("collection")) {
      return this.ERROR_CATEGORIES.DATABASE;
    }

    if (["EPROTO", "ECONNREFUSED", "ENOTFOUND", "ECONNRESET", "EHOSTUNREACH"].includes(code) ||
      message.includes("kết nối")) {
      return this.ERROR_CATEGORIES.NETWORK;
    }

    if (code === "ECONNABORTED" || code === "ETIMEDOUT" || message.includes("hết thời gian")) {
      return this.ERROR_CATEGORIES.TIMEOUT;
    }

    if (code === 50013 || message.includes("quyền")) {
      return this.ERROR_CATEGORIES.PERMISSION;
    }

    return this.ERROR_CATEGORIES.UNKNOWN;
  }

  static extractApiErrorInfo(error) {
    const payload = error?.response?.data
      || error?.data
      || error?.body
      || error?.details?.response
      || null;

    const status = Number(
      error?.status
      || error?.statusCode
      || error?.response?.status
      || error?.response?.statusCode
      || payload?.status
      || payload?.statusCode
      || 0
    ) || null;

    const apiMessage = typeof payload?.message === "string" && payload.message.trim()
      ? payload.message.trim()
      : typeof error?.apiMessage === "string" && error.apiMessage.trim()
        ? error.apiMessage.trim()
        : null;

    const apiError = typeof payload?.error === "string" && payload.error.trim()
      ? payload.error.trim()
      : typeof error?.apiError === "string" && error.apiError.trim()
        ? error.apiError.trim()
        : null;

    const requestId = payload?.request_id
      || payload?.requestId
      || error?.request_id
      || error?.requestId
      || null;

    return {
      status,
      apiMessage,
      apiError,
      requestId,
      payload,
    };
  }

  static getUserFriendlyMessage(error, context = "") {
    const category = this.categorizeError(error);
    const message = typeof error?.message === "string"
      ? error.message
      : "Đã xảy ra lỗi không xác định";
    const apiInfo = this.extractApiErrorInfo(error);

    switch (category) {
      case this.ERROR_CATEGORIES.VALIDATION:
        return apiInfo.apiMessage
          || apiInfo.apiError
          || "Dữ liệu không hợp lệ. Vui lòng kiểm tra lại thông tin.";

      case this.ERROR_CATEGORIES.DATABASE:
        return "Lỗi cơ sở dữ liệu. Vui lòng thử lại sau.";

      case this.ERROR_CATEGORIES.NETWORK:
        return "Không thể kết nối đến server. Vui lòng kiểm tra kết nối mạng.";

      case this.ERROR_CATEGORIES.TIMEOUT:
        return apiInfo.apiMessage
          || apiInfo.apiError
          || "Yêu cầu mất quá nhiều thời gian. Vui lòng thử lại với nội dung ngắn gọn hơn.";

      case this.ERROR_CATEGORIES.PERMISSION:
        return "Bot không có quyền thực hiện hành động này.";

      case this.ERROR_CATEGORIES.API:
        if (error?.code === "IMAGE_PROMPT_BLOCKED") {
          return "Yêu cầu của bạn vi phạm tiêu chuẩn an toàn. Mình không thể vẽ cho bạn được.";
        }
        if (apiInfo.apiMessage) {
          return apiInfo.apiMessage;
        }
        if (apiInfo.apiError) {
          return apiInfo.apiError;
        }
        if (message.includes("vi phạm") || message.includes("không phù hợp")) {
          return "Nội dung vi phạm chính sách an toàn. Vui lòng thử với nội dung khác.";
        }
        if (apiInfo.status === 400 || apiInfo.status === 422) {
          return "Yêu cầu không hợp lệ. Vui lòng kiểm tra lại nội dung và thử lại.";
        }
        if (apiInfo.status === 401 || apiInfo.status === 403 || message.includes("xác thực")) {
          return "Lỗi xác thực API. Vui lòng liên hệ quản trị viên.";
        }
        if (apiInfo.status === 429) {
          return "Đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.";
        }
        if (apiInfo.status === 408 || apiInfo.status === 504) {
          return "Yêu cầu mất quá nhiều thời gian. Vui lòng thử lại sau.";
        }
        if (apiInfo.status === 503 || message.includes("bận")) {
          return "Hệ thống AI đang bận. Vui lòng thử lại sau vài giây.";
        }
        if (apiInfo.status >= 500) {
          return "Lỗi từ hệ thống AI. Vui lòng thử lại sau.";
        }
        return "Lỗi từ hệ thống AI. Vui lòng thử lại sau.";

      default:
        if (context) {
          return `Xin lỗi, tôi gặp lỗi khi ${context}. Vui lòng thử lại sau.`;
        }
        return "Xin lỗi, đã xảy ra lỗi. Vui lòng thử lại sau.";
    }
  }

  static logError(context, message, error, level = "error") {
    const apiInfo = this.extractApiErrorInfo(error);
    const errorInfo = {
      context,
      category: this.categorizeError(error),
      message: error?.message || message,
      code: error?.code,
      status: apiInfo.status,
      apiMessage: apiInfo.apiMessage,
      apiError: apiInfo.apiError,
      requestId: apiInfo.requestId,
      stack: error?.stack,
    };

    logger[level === "warn" ? "warn" : "error"](context, message, errorInfo);
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
        if (!this.isRecoverableError(error) || attempt === maxRetries) {
          throw error;
        }

        logger.warn("retry", `Attempt ${attempt}/${maxRetries} failed, retrying in ${delayMs * attempt}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
      }
    }
  }
}

module.exports = ErrorHandler;