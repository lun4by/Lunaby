const { EmbedBuilder, ContainerBuilder } = require('discord.js');

/**
 * Tạo EmbedBuilder mới từ một điểm vào dùng chung.
 * Dùng một factory giúp cú pháp dựng embed đồng nhất giữa các module.
 * @returns {EmbedBuilder}
 */
function createEmbed() {
  return new EmbedBuilder();
}

/**
 * Tạo ContainerBuilder mới cho payload Components V2.
 * Dùng factory giúp cách khởi tạo container dễ đoán và dễ bảo trì hơn.
 * @returns {ContainerBuilder}
 */
function createContainer() {
  return new ContainerBuilder();
}

module.exports = {
  createEmbed,
  createContainer,
};