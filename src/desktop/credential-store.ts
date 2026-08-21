import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { app, safeStorage } from 'electron';

export type SavedRetroAchievementsAccount = {
  username: string;
  webApiKey: string;
};

type StoredCredentials = {
  version: 1;
  encrypted: string;
};

function credentialsPath() {
  return path.join(app.getPath('userData'), 'retroachievements-account.json');
}

export async function loadRetroAchievementsAccount(): Promise<SavedRetroAchievementsAccount | undefined> {
  try {
    const stored = JSON.parse(await fs.readFile(credentialsPath(), 'utf8')) as StoredCredentials;
    if (stored.version !== 1 || typeof stored.encrypted !== 'string') return undefined;
    const decrypted = safeStorage.decryptString(Buffer.from(stored.encrypted, 'base64'));
    const account = JSON.parse(decrypted) as Partial<SavedRetroAchievementsAccount>;
    return typeof account.username === 'string' && typeof account.webApiKey === 'string'
      ? { username: account.username, webApiKey: account.webApiKey }
      : undefined;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    console.warn(
      `Could not load the saved RetroAchievements account: ${error instanceof Error ? error.message : String(error)}`
    );
    return undefined;
  }
}

export async function saveRetroAchievementsAccount(account: SavedRetroAchievementsAccount) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure credential storage is not available on this computer, so the Web API key was not saved.');
  }

  const encrypted = safeStorage.encryptString(JSON.stringify(account)).toString('base64');
  const target = credentialsPath();
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify({ version: 1, encrypted } satisfies StoredCredentials), { mode: 0o600 });
  await fs.rename(temporary, target);
}

export async function clearRetroAchievementsAccount() {
  await fs.rm(credentialsPath(), { force: true });
}

export async function clearLegacyScreenScraperAccount() {
  await fs.rm(path.join(app.getPath('userData'), 'screenscraper-account.json'), { force: true });
}
