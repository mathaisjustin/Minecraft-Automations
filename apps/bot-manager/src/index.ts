import { loadBotConfig } from '@mc/config';
import { createLogger } from '@mc/logger';
import { BotManager } from './manager.js';
import { loadDesiredState } from './persistence.js';
import { startApiServer } from './server.js';

const botName = process.env.BOT_NAME ?? 'AFK_Bot';
const logger = createLogger(botName);
const config = loadBotConfig(botName);
const manager = new BotManager(config, logger);

// Default when there's no saved state: stay stopped and wait for an API call.
// Set AUTO_START_BOT=true to have a fresh container connect immediately.
const fallback = process.env.AUTO_START_BOT === 'true' ? 'running' : 'stopped';
const desired = loadDesiredState(fallback);

startApiServer(manager, botName, logger);

if (desired === 'running') {
  logger.info('restoring desired state: running');
  manager.start(false); // don't re-persist; we're just restoring
} else {
  logger.info('idle — POST /bots/' + botName + '/start to connect');
}

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`received ${signal}, shutting down`);
  // Stop the bot but DON'T persist 'stopped' — a container restart should
  // resume whatever the user last asked for, not treat a restart as a stop.
  await manager.stop(false);
  setTimeout(() => process.exit(0), 500);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
