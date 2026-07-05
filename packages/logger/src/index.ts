export type LogLevel = 'info' | 'warn' | 'error';

export type LifecycleEvent =
  | 'connected'
  | 'moving'
  | 'afking'
  | 'death'
  | 'respawned'
  | 'disconnected'
  | 'reconnecting'
  | 'stopped'
  | 'heartbeat'
  | 'error';

export interface Logger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  event(event: LifecycleEvent, message: string, data?: Record<string, unknown>): void;
}

const useJson = process.env.LOG_FORMAT === 'json' || !process.stdout.isTTY;

function write(
  name: string,
  level: LogLevel,
  message: string,
  data?: Record<string, unknown>,
  event?: LifecycleEvent,
): void {
  const timestamp = new Date().toISOString();
  if (useJson) {
    console.log(JSON.stringify({ timestamp, level, bot: name, event, message, ...data }));
  } else {
    const tag = event ? ` [${event.toUpperCase()}]` : '';
    const extra = data && Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : '';
    console.log(`${timestamp} [${level.toUpperCase()}] [${name}]${tag} ${message}${extra}`);
  }
}

export function createLogger(name: string): Logger {
  return {
    info: (message, data) => write(name, 'info', message, data),
    warn: (message, data) => write(name, 'warn', message, data),
    error: (message, data) => write(name, 'error', message, data),
    event: (event, message, data) =>
      write(name, event === 'error' ? 'error' : 'info', message, data, event),
  };
}
