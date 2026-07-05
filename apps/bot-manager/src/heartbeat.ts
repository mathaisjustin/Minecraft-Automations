import type { Logger } from '@mc/logger';
import type { BotClient } from '@mc/minecraft-client';
import type { StateTracker } from './state.js';

const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

/** Periodic proof-of-life log: state, health, food, position, uptime. */
export class Heartbeat {
  private timer: NodeJS.Timeout | null = null;
  private connectedSince: number | null = null;

  constructor(
    private client: BotClient,
    private state: StateTracker,
    private logger: Logger,
  ) {}

  start(): void {
    this.connectedSince = Date.now();
    this.stopTimer();
    this.timer = setInterval(() => this.beat(), HEARTBEAT_INTERVAL_MS);
    this.beat();
  }

  stop(): void {
    this.stopTimer();
    this.connectedSince = null;
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private beat(): void {
    if (!this.client.isConnected()) return;
    try {
      const status = this.client.getStatus();
      const uptimeMin = this.connectedSince
        ? Math.round((Date.now() - this.connectedSince) / 60000)
        : 0;
      this.logger.event('heartbeat', 'alive', {
        state: this.state.current,
        health: status.health,
        food: status.food,
        position: status.position,
        dimension: status.dimension,
        connectedMinutes: uptimeMin,
      });
    } catch (err) {
      this.logger.warn('heartbeat failed', { error: String(err) });
    }
  }
}
