const { Collection } = require("discord.js");
const ProfileDB = require("../services/database/profiledb");
const GuildProfileDB = require("../services/database/guildprofiledb");
const logger = require("./logger.js");

const XP_MIN = 10;
const XP_MAX = 25;
const GLOBAL_XP_PER_MSG = 3;
const COOLDOWN_MS = 60000;

const noXP = (reason) => ({ xpAdded: false, reason });

const calcCap = (level) => 50 * level * level + 250 * level;

async function experience(message, command_executed, execute) {
  if (!message.client.features?.includes("EXPERIENCE_POINTS")) return noXP("DISABLED");
  if (command_executed) return noXP("COMMAND_EXECUTED");
  if (!execute) return noXP("COMMAND_TERMINATED");
  if (!message.guild || message.channel.type === "dm") return noXP("DM_CHANNEL");

  try {
    if (!message.client.xpCooldowns) message.client.xpCooldowns = new Collection();
    if (message.client.xpCooldowns.has(message.author.id)) return noXP("RECENTLY_TALKED");

    const guildProfile = await GuildProfileDB.getGuildProfile(message.guild.id);
    if (!guildProfile.xp?.isActive) return noXP("DISABLED_ON_GUILD");
    if (guildProfile.xp?.exceptions?.includes(message.channel.id)) return noXP("DISABLED_ON_CHANNEL");

    const points = Math.floor(Math.random() * (XP_MAX - XP_MIN)) + XP_MIN;
    const doc = await ProfileDB.getProfile(message.author.id);

    if (!doc.data.xp) doc.data.xp = [];

    const serverIndex = doc.data.xp.findIndex(x => x.id === message.guild.id);
    const previousLevel = serverIndex !== -1 ? doc.data.xp[serverIndex].level : 0;
    const isFirstXP = serverIndex === -1;

    const serverData = isFirstXP
      ? { id: message.guild.id, xp: 0, level: 1 }
      : doc.data.xp[serverIndex];

    if (isFirstXP) doc.data.xp.push(serverData);

    doc.data.global_xp = (doc.data.global_xp || 0) + GLOBAL_XP_PER_MSG;
    while (calcCap(doc.data.global_level) - doc.data.global_xp < 1) doc.data.global_level++;

    serverData.xp += points;
    while (calcCap(serverData.level) - serverData.xp < 1) serverData.level++;

    if (serverIndex !== -1) doc.data.xp[serverIndex] = serverData;

    const profileCollection = await ProfileDB.getProfileCollection();
    await profileCollection.updateOne(
      { _id: message.author.id },
      { $set: { data: doc.data } }
    );

    message.client.xpCooldowns.set(message.author.id, Date.now());
    setTimeout(() => message.client.xpCooldowns.delete(message.author.id), COOLDOWN_MS);

    return { xpAdded: true, reason: null, points, level: serverData.level, previousLevel, totalXp: serverData.xp, isFirstXP };
  } catch (error) {
    logger.error("XP", "Lỗi XP:", error);
    return { xpAdded: false, reason: "DB_ERROR", error: error.message };
  }
}

module.exports = experience;