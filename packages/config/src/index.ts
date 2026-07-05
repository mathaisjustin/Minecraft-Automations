import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

const locationSchema = z.object({
  dimension: z.enum(['overworld', 'nether', 'end']),
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

const botSchema = z.object({
  username: z.string().min(1),
  afkLocation: z.string().min(1),
  reconnect: z.object({
    initialDelayMs: z.number().positive(),
    maxDelayMs: z.number().positive(),
  }),
});

const locationsSchema = z.record(z.string(), locationSchema);
const botsSchema = z.record(z.string(), botSchema);

const serverEnvSchema = z.object({
  MC_HOST: z.string().min(1),
  MC_PORT: z.coerce.number().int().positive(),
  MC_VERSION: z.string().min(1),
});

export type Location = z.infer<typeof locationSchema>;

export interface ResolvedBotConfig {
  host: string;
  port: number;
  version: string;
  username: string;
  afkLocationName: string;
  afkLocation: Location;
  reconnect: { initialDelayMs: number; maxDelayMs: number };
}

// JSON data files live at the package root, one level up from dist/.
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(join(packageRoot, file), 'utf8'));
}

export function loadBotConfig(botName: string): ResolvedBotConfig {
  loadEnv();

  const env = serverEnvSchema.parse(process.env);
  const bots = botsSchema.parse(readJson('bots.json'));
  const locations = locationsSchema.parse(readJson('locations.json'));

  const bot = bots[botName];
  if (!bot) {
    throw new Error(`Bot "${botName}" not found in bots.json (available: ${Object.keys(bots).join(', ')})`);
  }

  const afkLocation = locations[bot.afkLocation];
  if (!afkLocation) {
    throw new Error(
      `Location "${bot.afkLocation}" (used by bot "${botName}") not found in locations.json (available: ${Object.keys(locations).join(', ')})`,
    );
  }

  return {
    host: env.MC_HOST,
    port: env.MC_PORT,
    version: env.MC_VERSION,
    username: bot.username,
    afkLocationName: bot.afkLocation,
    afkLocation,
    reconnect: bot.reconnect,
  };
}
