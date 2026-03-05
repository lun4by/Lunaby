require("dotenv").config();
console.clear();

const {
	Client,
	GatewayIntentBits,
	Partials,
	Collection,
} = require("discord.js");
const { loadCommands } = require("./handlers/commandHandler");
const { startbot } = require("./events/ready");
const { setupGuildEvents } = require("./events/guildEvents");
const { setupInteractionCreateEvent } = require("./events/interactionCreate");
const { setupMessageCreateEvent } = require("./events/messageCreate");
const { setupVoiceStateEvent } = require("./events/voiceStateUpdate");
const logger = require("./utils/logger.js");

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.DirectMessages,
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.GuildMessageReactions,
		GatewayIntentBits.GuildVoiceStates,
	],
	partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});

client.commands = new Collection();
client.features = ["EXPERIENCE_POINTS"];

setupGuildEvents(client);
setupInteractionCreateEvent(client);
setupMessageCreateEvent(client);
setupVoiceStateEvent(client);

startbot(client, () => loadCommands(client));

process.on("unhandledRejection", (error) => {
	logger.error("SYSTEM", "Lỗi không được xử lý:", error);
});

client.login(process.env.DISCORD_TOKEN);
