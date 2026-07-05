import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export type DesiredState = 'running' | 'stopped';

const STATE_FILE = process.env.STATE_FILE ?? './data/state.json';

interface PersistedState {
  desired: DesiredState;
}

/** Restore the last desired state so a container restart resumes what the user asked for. */
export function loadDesiredState(fallback: DesiredState): DesiredState {
  try {
    const raw = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as PersistedState;
    return raw.desired === 'running' || raw.desired === 'stopped' ? raw.desired : fallback;
  } catch {
    return fallback;
  }
}

export function saveDesiredState(desired: DesiredState): void {
  try {
    mkdirSync(dirname(STATE_FILE), { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify({ desired } satisfies PersistedState));
  } catch {
    // Persistence is best-effort; a failure here shouldn't crash the bot.
  }
}
