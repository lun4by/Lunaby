const STOP_WORDS = new Set([
  "và", "hoặc", "nhưng", "nếu", "vì", "bởi", "với", "từ", "đến", "trong", "ngoài",
  "a", "an", "the", "and", "or", "but", "if", "because", "with", "from", "to", "in", "out"
]);

const LOADING_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const BAR_LENGTH = 25;

module.exports = {
  createMessageSummary(content, role) {
    if (!content || content.length < 5) return null;

    const prefix = role === "user" ? "Người dùng đã hỏi: " : "Tôi đã trả lời: ";
    const summary = prefix + content;

    return summary.length > 100 ? summary.substring(0, 100) + "..." : summary;
  },


  extractKeywords(prompt) {
    if (!prompt?.length || prompt.length < 3) return [];

    return [...new Set(
      prompt
        .toLowerCase()
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
        .split(/\s+/)
        .filter(word => word.length > 3 && !STOP_WORDS.has(word))
    )].slice(0, 5);
  },


  extractKeyMessages(history) {
    if (!history?.length) return [];

    const userMessages = history
      .filter(msg => msg.role === "user")
      .map(msg => msg.content);

    const significantMessages = userMessages.filter(
      msg => msg.length > 10 && msg.length < 200
    );

    const messages = significantMessages.length ? significantMessages : userMessages;
    return messages.slice(-5).map(msg =>
      msg.length > 100 ? msg.substring(0, 100) + "..." : msg
    );
  },


  identifyMainTopics(history) {
    if (!history?.length) return ["Chưa có đủ dữ liệu"];

    const allKeywords = history
      .filter(msg => msg.role === "user")
      .flatMap(msg => this.extractKeywords(msg.content));

    const keywordFrequency = allKeywords.reduce((acc, keyword) => {
      acc[keyword] = (acc[keyword] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(keywordFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(entry => entry[0]);
  },


  formatTimeAgo(timestamp) {
    const secondsAgo = Math.floor((Date.now() - timestamp) / 1000);

    if (secondsAgo < 60) return `${secondsAgo} giây`;

    const minutesAgo = Math.floor(secondsAgo / 60);
    if (minutesAgo < 60) return `${minutesAgo} phút`;

    const hoursAgo = Math.floor(minutesAgo / 60);
    if (hoursAgo < 24) return `${hoursAgo} giờ`;

    return `${Math.floor(hoursAgo / 24)} ngày`;
  },


  getLoadingAnimation(step) {
    return LOADING_FRAMES[step % LOADING_FRAMES.length];
  },


  getProgressBar(percent) {
    const completed = Math.floor((percent / 100) * BAR_LENGTH);

    const statusIcon =
      Object.entries({ 0: "⬛", 25: "<:thinking:1050344785153626122>", 50: "<:wao:1050344773698977853>", 75: "🔆", 90: "⏭️", 100: "<:like:1049784377103622218>" })
        .reverse()
        .find(([t]) => percent >= parseInt(t))?.[1] || "⬛";

    return `${statusIcon} │${"█".repeat(completed)}${"▒".repeat(BAR_LENGTH - completed)}│ ${percent.toString().padStart(3, " ")}%`;
  }
};