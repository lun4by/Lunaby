const MariaModDB = require('../database/MariaModDB');
const logger = require('../../utils/core/logger');

const MAX_NOTICE_LINE_LENGTH = 180;
const MAX_DISCORD_CONTENT_LENGTH = 2000;

function compactNoticeMessage(message) {
  return String(message || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NOTICE_LINE_LENGTH);
}

function buildNoticeLine(message) {
  const compact = compactNoticeMessage(message);
  if (!compact) {
    return null;
  }

  return `-# ${compact}`;
}

function composeNoticeContent(currentContent, noticeLine) {
  const content = currentContent || '';
  const nextContent = content ? `${content}\n${noticeLine}` : noticeLine;

  if (nextContent.length <= MAX_DISCORD_CONTENT_LENGTH) {
    return nextContent;
  }

  return nextContent.slice(0, MAX_DISCORD_CONTENT_LENGTH - 3) + '...';
}

function createNoticeError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

class CommandNoticeService {
  async appendActiveNotice(target) {
    try {
      if (!target?.fetchReply || !target?.editReply) {
        return;
      }

      if (!target.replied && !target.deferred) {
        return;
      }

      const notice = await MariaModDB.getActiveSystemNotice(target.guildId || null);
      if (!notice?.message) {
        return;
      }

      const noticeLine = buildNoticeLine(notice.message);
      if (!noticeLine) {
        return;
      }

      const reply = await target.fetchReply().catch(() => null);
      if (!reply) {
        return;
      }

      const currentContent = typeof reply.content === 'string' ? reply.content : '';
      if (currentContent.includes(noticeLine)) {
        return;
      }

      const mergedContent = composeNoticeContent(currentContent, noticeLine);
      await target.editReply({ content: mergedContent }).catch(() => { });
    } catch (error) {
      logger.error('system_notice', 'Failed to append active notice:', error);
    }
  }

  async createNotice({ message, guildId = null, hours, createdBy }) {
    const normalizedHours = Math.trunc(Number(hours) || 0);
    if (normalizedHours <= 0 || normalizedHours > 720) {
      throw createNoticeError('NOTICE_INVALID_HOURS');
    }

    const compact = compactNoticeMessage(message);
    if (!compact) {
      throw createNoticeError('NOTICE_EMPTY_MESSAGE');
    }

    const startsAt = new Date();
    const expiresAt = new Date(startsAt.getTime() + normalizedHours * 60 * 60 * 1000);

    const id = await MariaModDB.createSystemNotice({
      message: compact,
      guildId,
      startsAt,
      expiresAt,
      createdBy,
    });

    return { id, message: compact, startsAt, expiresAt, guildId };
  }

  async listNotices(guildId = null, limit = 10) {
    return MariaModDB.listSystemNotices({ guildId, limit });
  }

  async removeNotice(id) {
    const noticeId = Math.trunc(Number(id) || 0);
    if (noticeId <= 0) {
      throw createNoticeError('NOTICE_INVALID_ID');
    }

    return MariaModDB.deactivateSystemNotice(noticeId);
  }
}

module.exports = new CommandNoticeService();