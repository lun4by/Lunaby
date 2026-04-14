const { MessageFlags } = require('discord.js');

function isSlashCommandInteraction(interaction) {
  return Boolean(interaction?.isChatInputCommand?.());
}

function normalizeHybridPayload(payload, isSlash) {
  if (isSlash || typeof payload !== 'object' || payload === null) {
    return payload;
  }

  // Prefix/message replies do not support interaction-specific visibility flags.
  const { ephemeral, flags, ...safePayload } = payload;
  return safePayload;
}

async function resolveHybridPrefix(interaction) {
  const PrefixDB = require('../../services/database/PrefixDB');
  return PrefixDB.resolvePrefix(interaction.user?.id || interaction.author?.id, interaction.guild?.id);
}

async function deferHybridReply(interaction, options = { flags: MessageFlags.Ephemeral }) {
  if (!isSlashCommandInteraction(interaction)) {
    return null;
  }

  if (interaction.deferred || interaction.replied) {
    return null;
  }

  return interaction.deferReply(options);
}

function createHybridReply(interaction, options = {}) {
  const { useEditReplyForSlash = false } = options;
  const isSlash = isSlashCommandInteraction(interaction);

  return (payload) => {
    const normalizedPayload = normalizeHybridPayload(payload, isSlash);

    if (isSlash) {
      if (useEditReplyForSlash) {
        return interaction.editReply(normalizedPayload);
      }

      return interaction.reply(normalizedPayload);
    }

    return interaction.reply(normalizedPayload);
  };
}

function getHybridSubcommand(interaction, fallback = null) {
  if (isSlashCommandInteraction(interaction)) {
    return interaction.options.getSubcommand();
  }

  return interaction.args?.[0]?.toLowerCase?.() || fallback;
}

module.exports = {
  createHybridReply,
  deferHybridReply,
  getHybridSubcommand,
  isSlashCommandInteraction,
  resolveHybridPrefix,
};