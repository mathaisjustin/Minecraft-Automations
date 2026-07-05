# minecraft-automation

Automation platform for a homelab Minecraft server. V1: a single Mineflayer AFK bot.
Built as a pnpm-workspace monorepo so it can grow (control API, Discord, dashboard, more
bots) without reworking the core.

## Status

- **V1** — bot connects, teleports to a configured AFK spot, auto-eats, auto-respawns on
  death, auto-reconnects with backoff, and shuts down cleanly. Runs in Docker.
- **V2** — an HTTP control API (`/bots/:name/start`, `/stop`, `/status`) so the bot can be
  toggled on/off on demand (e.g. stopped while players are online to save server RAM,
  started when everyone logs off).

## Structure

```
apps/
  bot-manager/        lifecycle runner + HTTP control API
packages/
  minecraft-client/   the only package that imports mineflayer
  config/             zod-validated config loader (.env + bots.json + locations.json)
  logger/             structured logger with lifecycle-event helpers
docker/
  bot-manager.Dockerfile
docker-compose.yml
```

## Configuration

Copy `.env.example` to `.env` and fill in your server's host/port/version. Bots are
defined in `packages/config/bots.json`, referencing named locations from
`packages/config/locations.json`.

## Running

```bash
pnpm install
pnpm -r build

# local, against a server on localhost
node apps/bot-manager/dist/index.js

# containerized (joins the Minecraft server's docker network)
docker compose up -d
```

## Control API

```bash
curl -X POST http://localhost:3000/bots/AFK_Bot/start
curl -X POST http://localhost:3000/bots/AFK_Bot/stop
curl http://localhost:3000/bots/AFK_Bot/status
```

Set `API_TOKEN` in the environment to require `Authorization: Bearer <token>` on requests.

## Deferred (intentionally, until a real need exists)

Movement strategy abstraction (pathfinding, etc. — currently a self-`/tp`), a separate
health/task/event-bus engine, Turborepo, Discord control, REST-facing dashboard, MCP/Claude
integration, multiple simultaneous bots. See the project's plan history for the reasoning
behind each deferral.
