const storageDB = require('../services/storagedb.js');
const ProfileDB = require('../services/profiledb.js');
const logger = require('../utils/logger.js');
require('dotenv').config();

async function handleResetdbInteraction(interaction) {
  if (!interaction.isButton()) return;

  const { customId, user } = interaction;
  const ownerId = process.env.OWNER_ID;

  if (user.id !== ownerId) {
    return interaction.reply({
      content: 'Bạn không có quyền thực hiện hành động này!',
      ephemeral: true,
    });
  }

  try {
    if (customId === 'reset_database_confirm') {
      await interaction.update({
        content: '⏳ **Đang reset database...**',
        components: [],
      });

      logger.info('RESET', `Owner ${user.tag} đã xác nhận reset database`);

      const success = await storageDB.resetDatabase();

      if (success) {
        await interaction.editReply({
          content:
            '✅ **Đã reset database thành công!**\n\n' +
            '> Tất cả dữ liệu đã được xóa\n' +
            '> Database đã được tạo lại\n' +
            '> Bot sẽ không còn nhớ cuộc trò chuyện trước đây\n\n' +
            '**Hệ thống đã sẵn sàng sử dụng!**',
        });

        logger.info('RESET', 'Database đã được reset thành công');
      } else {
        await interaction.editReply({
          content:
            '❌ **Lỗi khi reset database!**\n\n' +
            '> Có lỗi xảy ra trong quá trình reset\n' +
            '> Vui lòng kiểm tra logs để biết thêm chi tiết\n' +
            '> Liên hệ admin nếu vấn đề tiếp tục',
        });

        logger.error('RESET', 'Lỗi khi reset database');
      }
    } else if (customId === 'reset_database_cancel') {
      await interaction.update({
        content:
          '❌ **Đã hủy reset database!**\n\n' +
          '> Không có thay đổi nào được thực hiện\n' +
          '> Database vẫn giữ nguyên\n' +
          '> Tất cả dữ liệu được bảo toàn\n\n' +
          '**Hệ thống hoạt động bình thường!**',
        components: [],
      });

      logger.info('RESET', `Owner ${user.tag} đã hủy reset database`);
    } else if (customId === 'reset_users_confirm') {
      await interaction.update({
        content: '⏳ **Đang reset user profiles...**',
        components: [],
      });

      logger.info('RESET', `Owner ${user.tag} đã xác nhận reset user profiles`);

      try {
        const profileCollection = await ProfileDB.getProfileCollection();
        const result = await profileCollection.deleteMany({});

        await interaction.editReply({
          content:
            '✅ **Đã reset user profiles thành công!**\n\n' +
            `> Đã xóa ${result.deletedCount} user profiles\n` +
            '> Tất cả XP, level, achievements đã bị xóa\n' +
            '> Users sẽ phải đồng ý consent lại\n' +
            '> Hệ thống đã sẵn sàng cho users mới\n\n' +
            '**User profiles đã được reset hoàn toàn!**',
        });

        logger.info('RESET', `Đã xóa ${result.deletedCount} user profiles`);
      } catch (error) {
        await interaction.editReply({
          content:
            '❌ **Lỗi khi reset user profiles!**\n\n' +
            '> Có lỗi xảy ra trong quá trình reset\n' +
            '> Vui lòng kiểm tra logs để biết thêm chi tiết\n' +
            '> Liên hệ admin nếu vấn đề tiếp tục',
        });

        logger.error('RESET', 'Lỗi khi reset user profiles:', error);
      }
    } else if (customId === 'reset_users_cancel') {
      await interaction.update({
        content:
          '❌ **Đã hủy reset user profiles!**\n\n' +
          '> Không có thay đổi nào được thực hiện\n' +
          '> User profiles vẫn giữ nguyên\n' +
          '> Tất cả dữ liệu users được bảo toàn\n\n' +
          '**Hệ thống hoạt động bình thường!**',
        components: [],
      });

      logger.info('RESET', `Owner ${user.tag} đã hủy reset user profiles`);
    }
  } catch (error) {
    logger.error('RESET', `Lỗi khi xử lý reset interaction:`, error);

    try {
      await interaction.followUp({
        content: '❌ Có lỗi xảy ra khi xử lý yêu cầu. Vui lòng thử lại sau!',
        ephemeral: true,
      });
    } catch (followUpError) {
      logger.error('RESET', 'Lỗi khi gửi follow-up message:', followUpError);
    }
  }
}

module.exports = {
  handleResetdbInteraction,
};
