import { EventEmitter } from 'node:events';
import mineflayer, { type Bot } from 'mineflayer';
import { loader as autoEatPlugin } from 'mineflayer-auto-eat';
import type { Location, ResolvedBotConfig } from '@mc/config';

export interface BotStatus {
  health: number;
  food: number;
  position: { x: number; y: number; z: number };
  dimension: string;
}

export interface BotClientEvents {
  connected: [];
  spawned: [];
  moved: [position: BotStatus['position']];
  died: [];
  respawned: [];
  disconnected: [reason: string];
  error: [error: Error];
}

/**
 * The only place in the repo that touches mineflayer directly.
 * Everything else talks to BotClient's methods and typed events.
 */
export class BotClient extends EventEmitter<BotClientEvents> {
  private bot: Bot | null = null;
  private config: ResolvedBotConfig;
  private hasSpawnedOnce = false;

  constructor(config: ResolvedBotConfig) {
    super();
    this.config = config;
  }

  /** Creates the mineflayer bot and resolves once the bot has spawned into the world. */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.hasSpawnedOnce = false;

      const bot = mineflayer.createBot({
        host: this.config.host,
        port: this.config.port,
        username: this.config.username,
        version: this.config.version,
        auth: 'offline',
      });
      this.bot = bot;

      bot.loadPlugin(autoEatPlugin);

      const onConnectError = (err: Error) => reject(err);
      bot.once('error', onConnectError);

      bot.once('login', () => {
        this.emit('connected');
      });

      bot.on('spawn', () => {
        if (!this.hasSpawnedOnce) {
          this.hasSpawnedOnce = true;
          bot.removeListener('error', onConnectError);
          bot.on('error', (err) => {
            this.emit('error', err);
          });
          this.emit('spawned');
          resolve();
        } else {
          // mineflayer fires 'spawn' again after a respawn
          this.emit('respawned');
        }
      });

      bot.on('death', () => {
        this.emit('died');
      });

      bot.on('kicked', (reason) => {
        this.emit('disconnected', `kicked: ${JSON.stringify(reason)}`);
      });

      bot.on('end', (reason) => {
        this.bot = null;
        this.emit('disconnected', reason);
      });
    });
  }

  disconnect(): void {
    this.bot?.quit();
    this.bot = null;
  }

  /**
   * Move the bot to a location. V1 implementation teleports via /tp
   * (bot must be op). This method is the single seam where real
   * pathfinding could replace teleporting later.
   */
  async moveTo(location: Location): Promise<void> {
    const bot = this.requireBot();
    bot.chat(`/tp ${this.config.username} ${location.x} ${location.y} ${location.z}`);
    // Give the server a moment to apply the teleport, then report where we are.
    await new Promise((r) => setTimeout(r, 1500));
    const pos = this.getStatus().position;
    this.emit('moved', pos);
  }

  getStatus(): BotStatus {
    const bot = this.requireBot();
    return {
      health: bot.health,
      food: bot.food,
      position: {
        x: Math.round(bot.entity.position.x * 10) / 10,
        y: Math.round(bot.entity.position.y * 10) / 10,
        z: Math.round(bot.entity.position.z * 10) / 10,
      },
      dimension: bot.game.dimension,
    };
  }

  isConnected(): boolean {
    return this.bot !== null;
  }

  private requireBot(): Bot {
    if (!this.bot) throw new Error('Bot is not connected');
    return this.bot;
  }
}

export type { Location, ResolvedBotConfig };
