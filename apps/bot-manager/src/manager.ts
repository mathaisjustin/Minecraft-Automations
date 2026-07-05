import type { ResolvedBotConfig } from '@mc/config';
import type { Logger } from '@mc/logger';
import { BotClient } from '@mc/minecraft-client';
import { Heartbeat } from './heartbeat.js';
import { saveDesiredState, type DesiredState } from './persistence.js';
import { backoffDelay } from './reconnect.js';
import { BotState, StateTracker } from './state.js';

// If the bot dies this many times within the window, something is wrong
// at the AFK spot (broken bed, mobs) — warn loudly instead of silently looping.
const DEATH_GUARD_LIMIT = 3;
const DEATH_GUARD_WINDOW_MS = 10 * 60 * 1000;

export interface ManagerStatus {
  bot: string;
  desired: DesiredState;
  state: BotState;
  connected: boolean;
  afkLocation: string;
  status: ReturnType<BotClient['getStatus']> | null;
}

/**
 * Owns the bot lifecycle and exposes it as start()/stop()/getStatus().
 * The reconnect loop runs only while `shouldRun` is true, so stop() cleanly
 * halts reconnection instead of fighting it.
 */
export class BotManager {
  private readonly state: StateTracker;
  private client: BotClient | null = null;
  private shouldRun = false;
  private loopPromise: Promise<void> | null = null;
  private wakeSleep: (() => void) | null = null;
  private readonly deathTimestamps: number[] = [];

  constructor(
    private readonly config: ResolvedBotConfig,
    private readonly logger: Logger,
  ) {
    this.state = new StateTracker(logger);
  }

  /** Start (or resume) the bot. Idempotent: a second call while running is a no-op. */
  start(persist = true): { started: boolean; alreadyRunning: boolean } {
    if (this.shouldRun) return { started: false, alreadyRunning: true };
    this.shouldRun = true;
    if (persist) saveDesiredState('running');
    this.logger.info('start requested');
    this.loopPromise = this.loop();
    return { started: true, alreadyRunning: false };
  }

  /** Stop the bot and stop reconnecting. Idempotent. */
  async stop(persist = true): Promise<{ stopped: boolean; alreadyStopped: boolean }> {
    if (!this.shouldRun) return { stopped: false, alreadyStopped: true };
    this.shouldRun = false;
    if (persist) saveDesiredState('stopped');
    this.logger.event('stopped', 'stop requested, disconnecting');
    this.wakeSleep?.(); // break out of any backoff wait immediately
    this.client?.disconnect();
    await this.loopPromise?.catch(() => undefined);
    this.state.transition(BotState.STOPPED);
    return { stopped: true, alreadyStopped: false };
  }

  getStatus(): ManagerStatus {
    let status: ManagerStatus['status'] = null;
    if (this.client?.isConnected()) {
      try {
        status = this.client.getStatus();
      } catch {
        status = null;
      }
    }
    return {
      bot: this.config.username,
      desired: this.shouldRun ? 'running' : 'stopped',
      state: this.state.current,
      connected: this.client?.isConnected() ?? false,
      afkLocation: this.config.afkLocationName,
      status,
    };
  }

  private async goAfk(client: BotClient): Promise<void> {
    this.state.transition(BotState.MOVING);
    this.logger.event('moving', `teleporting to ${this.config.afkLocationName}`, this.config.afkLocation);
    await client.moveTo(this.config.afkLocation);
    this.state.transition(BotState.AFK);
    this.logger.event('afking', `AFK at ${this.config.afkLocationName}`, client.getStatus().position);
  }

  private checkDeathGuard(): void {
    const now = Date.now();
    this.deathTimestamps.push(now);
    while (this.deathTimestamps.length > 0 && this.deathTimestamps[0]! < now - DEATH_GUARD_WINDOW_MS) {
      this.deathTimestamps.shift();
    }
    if (this.deathTimestamps.length >= DEATH_GUARD_LIMIT) {
      this.logger.warn(
        `bot died ${this.deathTimestamps.length} times in the last ${DEATH_GUARD_WINDOW_MS / 60000} minutes — check the AFK spot (bed intact? mobs? food?)`,
      );
    }
  }

  /** One connection session: connect, AFK, resolve when the connection ends. */
  private runSession(): Promise<string> {
    return new Promise((resolve, reject) => {
      const client = new BotClient(this.config);
      this.client = client;
      const heartbeat = new Heartbeat(client, this.state, this.logger);

      client.on('connected', () => {
        this.state.transition(BotState.CONNECTED);
        this.logger.event('connected', `logged in to ${this.config.host}:${this.config.port}`);
      });

      client.on('spawned', () => {
        heartbeat.start();
        this.goAfk(client).catch((err) =>
          this.logger.error('failed to reach AFK spot', { error: String(err) }),
        );
      });

      client.on('died', () => {
        this.state.transition(BotState.DEAD);
        this.logger.event('death', 'bot died, waiting for respawn');
        this.checkDeathGuard();
        this.state.transition(BotState.RESPAWNING);
      });

      client.on('respawned', () => {
        this.logger.event('respawned', 'bot respawned, returning to AFK spot');
        this.goAfk(client).catch((err) =>
          this.logger.error('failed to reach AFK spot', { error: String(err) }),
        );
      });

      client.on('error', (err) => {
        this.logger.event('error', 'client error', { error: String(err) });
      });

      client.on('disconnected', (reason) => {
        heartbeat.stop();
        this.client = null;
        this.logger.event('disconnected', 'connection ended', { reason });
        resolve(reason);
      });

      this.state.transition(BotState.CONNECTING);
      this.logger.info(`connecting to ${this.config.host}:${this.config.port} as ${this.config.username}`);
      client.connect().catch((err) => {
        heartbeat.stop();
        this.client = null;
        reject(err);
      });
    });
  }

  /** Reconnect loop, guarded by shouldRun so stop() can halt it. */
  private async loop(): Promise<void> {
    let attempt = 0;
    while (this.shouldRun) {
      try {
        await this.runSession();
        attempt = 0; // a session was established; reset backoff after it ends
      } catch (err) {
        this.logger.error('connection attempt failed', { error: String(err) });
      }
      if (!this.shouldRun) break;

      const delay = backoffDelay(attempt, this.config.reconnect);
      attempt += 1;
      this.state.transition(BotState.RECONNECTING);
      this.logger.event('reconnecting', `retrying in ${delay / 1000}s (attempt ${attempt})`);
      await this.interruptibleSleep(delay);
    }
  }

  /** Sleep that stop() can cut short, so stopping during backoff is instant. */
  private interruptibleSleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      this.wakeSleep = () => {
        clearTimeout(timer);
        this.wakeSleep = null;
        resolve();
      };
    });
  }
}
