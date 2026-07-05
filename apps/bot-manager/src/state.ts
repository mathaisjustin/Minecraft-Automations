import type { Logger } from '@mc/logger';

export enum BotState {
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  MOVING = 'MOVING',
  AFK = 'AFK',
  DEAD = 'DEAD',
  RESPAWNING = 'RESPAWNING',
  RECONNECTING = 'RECONNECTING',
  STOPPED = 'STOPPED',
  ERROR = 'ERROR',
}

/** Holds the bot's current state and logs every transition. */
export class StateTracker {
  private state: BotState = BotState.STOPPED;

  constructor(private logger: Logger) {}

  get current(): BotState {
    return this.state;
  }

  transition(next: BotState): void {
    if (next === this.state) return;
    this.logger.info(`state: ${this.state} -> ${next}`);
    this.state = next;
  }
}
