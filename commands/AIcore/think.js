const { SlashCommandBuilder } = require('discord.js');
const AICore = require('../../services/AICore');
const QuotaService = require('../../services/QuotaService');
const logger = require('../../utils/logger.js');
const { splitMessageIntoChunks } = require('../../handlers/messageHandlers/memoryRequestHandler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('think')
    .setDescription('Hiển thị quá trình suy nghĩ của AI khi trả lời câu hỏi của bạn')
    .addStringOption(option =>
      option.setName('prompt')
        .setDescription('Nhập câu hỏi hoặc vấn đề bạn muốn AI phân tích')
        .setRequired(true)),

  async execute(interaction) {
    const prompt = interaction.options.getString('prompt');

    await interaction.deferReply();

    try {
      const userId = interaction.user.id;
      const messageCheck = await QuotaService.canUseMessages(userId, 1);

      if (!messageCheck.allowed) {
        const roleNames = {
          user: 'Người dùng',
          helper: 'Helper',
          admin: 'Admin',
          owner: 'Owner'
        };
        
        await interaction.editReply(
          `**Giới hạn Lượt nhắn tin**\n\n` +
          `Bạn đã sử dụng hết giới hạn lượt nhắn tin hàng ngày!\n\n` +
          `**Thông tin:**\n` +
          `• Vai trò: ${roleNames[messageCheck.role] || messageCheck.role}\n` +
          `• Đã sử dụng: ${messageCheck.current.toLocaleString()} lượt\n` +
          `• Giới hạn: ${messageCheck.limit.toLocaleString()} lượt/ngày\n` +
          `• Còn lại: ${messageCheck.remaining.toLocaleString()} lượt\n\n` +
          `Giới hạn sẽ được reset vào ngày mai. Vui lòng quay lại sau!`
        );
        return;
      }

      const result = await AICore.getThinkingResponse(prompt);
      let response = result.content;

      if (result.usage && result.usage.total_tokens) {
        QuotaService.recordMessageUsage(userId, 1, 'think').catch(() => {});
      }

      if (response.length <= 2000) {
        await interaction.editReply({
          content: response
        });
      } else {
        const chunks = splitMessageIntoChunks(response);

        await interaction.editReply({
          content: chunks[0]
        });

        for (let i = 1; i < chunks.length; i++) {
          await interaction.followUp({
            content: chunks[i]
          });
        }
      }
    } catch (error) {
      logger.error('COMMAND', 'Lỗi khi xử lý lệnh /think:', error);

      let errorMsg = '💭 **Không thể phân tích câu hỏi**\n\n';
      
      if (error.message.includes('vi phạm') || error.message.includes('không được phép')) {
        errorMsg += '❌ **Lý do:** Nội dung vi phạm chính sách an toàn\n';
        errorMsg += '> Câu hỏi của bạn chứa nội dung không phù hợp theo chính sách AI';
      } else if (error.message.includes('hệ thống') || error.message.includes('Internal')) {
        errorMsg += '⏳ **Lý do:** Hệ thống AI đang bận\n';
        errorMsg += '> Vui lòng thử lại sau vài phút';
      } else if (error.message.includes('timeout') || error.message.includes('Hết thời gian')) {
        errorMsg += '⏱️ **Lý do:** Yêu cầu quá lâu\n';
        errorMsg += '> Vui lòng thử lại với câu hỏi ngắn gọn hơn';
      } else if (error.message.includes('kết nối')) {
        errorMsg += '🔌 **Lý do:** Không thể kết nối API\n';
        errorMsg += '> Kiểm tra kết nối mạng hoặc thử lại sau';
      } else if (error.details) {
        errorMsg += `❌ **Lý do:** ${error.details}`;
      } else {
        errorMsg += '❌ **Lý do:** Lỗi không xác định\n';
        errorMsg += '> Vui lòng thử lại sau hoặc liên hệ admin';
      }
      
      errorMsg += '\n\n💡 **Gợi ý:** Thử sử dụng lệnh `@Lunaby` thay thế!';

      await interaction.editReply(errorMsg);
    }
  }
};

