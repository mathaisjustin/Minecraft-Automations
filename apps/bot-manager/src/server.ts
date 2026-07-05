import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Logger } from '@mc/logger';
import type { BotManager } from './manager.js';

const API_TOKEN = process.env.API_TOKEN ?? '';

interface Route {
  method: string;
  pattern: RegExp;
  handle: (res: ServerResponse, params: string[]) => Promise<void> | void;
}

function json(res: ServerResponse, code: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(payload);
}

/**
 * Minimal HTTP control plane for the bot. One bot today, so routes carry the
 * bot name and 404 if it doesn't match the configured bot.
 */
export function startApiServer(manager: BotManager, botName: string, logger: Logger): void {
  const port = Number(process.env.API_PORT ?? 3000);

  const matchesBot = (name: string): boolean => name === botName;

  const routes: Route[] = [
    {
      method: 'GET',
      pattern: /^\/health$/,
      handle: (res) => json(res, 200, { ok: true }),
    },
    {
      method: 'GET',
      pattern: /^\/bots\/([^/]+)\/status$/,
      handle: (res, [name]) => {
        if (!matchesBot(name!)) return json(res, 404, { error: `unknown bot: ${name}` });
        json(res, 200, manager.getStatus());
      },
    },
    {
      method: 'POST',
      pattern: /^\/bots\/([^/]+)\/start$/,
      handle: (res, [name]) => {
        if (!matchesBot(name!)) return json(res, 404, { error: `unknown bot: ${name}` });
        const result = manager.start();
        json(res, 200, { ...result, ...manager.getStatus() });
      },
    },
    {
      method: 'POST',
      pattern: /^\/bots\/([^/]+)\/stop$/,
      handle: async (res, [name]) => {
        if (!matchesBot(name!)) return json(res, 404, { error: `unknown bot: ${name}` });
        const result = await manager.stop();
        json(res, 200, { ...result, ...manager.getStatus() });
      },
    },
  ];

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = (req.url ?? '').split('?')[0] ?? '';
    const method = req.method ?? 'GET';

    // Optional bearer-token auth (skipped for /health so liveness checks stay open).
    if (API_TOKEN && url !== '/health') {
      const auth = req.headers.authorization ?? '';
      if (auth !== `Bearer ${API_TOKEN}`) {
        return json(res, 401, { error: 'unauthorized' });
      }
    }

    for (const route of routes) {
      if (route.method !== method) continue;
      const m = url.match(route.pattern);
      if (m) {
        Promise.resolve(route.handle(res, m.slice(1))).catch((err) => {
          logger.error('request handler failed', { error: String(err) });
          if (!res.headersSent) json(res, 500, { error: 'internal error' });
        });
        return;
      }
    }
    json(res, 404, { error: 'not found' });
  });

  server.listen(port, () => {
    logger.info(`API listening on :${port}${API_TOKEN ? ' (token auth enabled)' : ''}`);
  });
}
