require("dotenv").config({ quiet: true });

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
const { setupGuildMemberAddEvent } = require("./events/guildMemberAdd");
const logger = require("./utils/core/logger.js");
const { initializeFileLogging } = require("./utils/core/logger.js");
const gatewayIntents = require("../gatewayIntents.json");

void initializeFileLogging();

const client = new Client({
	intents: Object.entries(gatewayIntents).map(([name, enabled]) => {
		if (!(name in GatewayIntentBits) || typeof enabled !== "boolean") {
			throw new Error(`Invalid gateway intent config: ${name}. Use a valid intent name and true/false.`);
		}
		return enabled ? GatewayIntentBits[name] : 0;
	}).filter((intent) => intent !== 0),
	partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});

client.commands = new Collection();
client.features = ["EXPERIENCE_POINTS"];

setupGuildEvents(client);
setupInteractionCreateEvent(client);
setupMessageCreateEvent(client);
setupVoiceStateEvent(client);
setupGuildMemberAddEvent(client);

startbot(client, () => loadCommands(client));

process.on("unhandledRejection", (error) => {
	logger.error("system", "Unhandled error:", error);
});

client.login(process.env.DISCORD_TOKEN);
