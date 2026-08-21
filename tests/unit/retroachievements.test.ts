import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ArtType } from '../../src/art.js';
import { RetroAchievementsClient } from '../../src/retroachievements.js';
import { resetStats, stats } from '../../src/stats.js';

const credentials = {
  username: 'player',
  webApiKey: 'personal-key',
  baseUrl: 'https://retroachievements.test'
};

let temporaryDirectory: string;

beforeEach(async () => {
  temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'mini-scraper-retroachievements-'));
  resetStats();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
});

test('authenticates, matches the canonical ROM hash, and reuses game metadata', async () => {
  const romPath = path.join(temporaryDirectory, 'Wario Land 3 (World).gbc');
  await fs.writeFile(romPath, 'test-rom');
  const requestUrls: URL[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = requestUrl(input);
      requestUrls.push(url);
      if (url.pathname.endsWith('/API_GetUserProfile.php')) return Response.json({ User: 'player' });
      if (url.pathname.endsWith('/API_GetGameList.php')) {
        return Response.json([
          {
            ID: 123,
            Title: 'Wario Land 3',
            Hashes: ['known-rom-hash']
          }
        ]);
      }

      if (url.pathname.endsWith('/API_GetGameExtended.php')) {
        return Response.json({
          ID: 123,
          ImageBoxArt: '/Images/box.png',
          ImageIngame: '/Images/screenshot.png',
          ImageTitle: '/Images/title.png'
        });
      }

      return new Response('Not found', { status: 404 });
    })
  );
  const hashRom = vi.fn(async () => 'known-rom-hash');
  const client = new RetroAchievementsClient({ credentials, hashRom });

  await expect(client.authenticate()).resolves.toEqual({ username: 'player' });
  await expect(
    client.findArtwork({ filePath: romPath, machine: 'Nintendo - Game Boy Color', type: ArtType.Boxart })
  ).resolves.toBe('https://retroachievements.test/Images/box.png');
  await expect(
    client.findArtwork({ filePath: romPath, machine: 'Nintendo - Game Boy Color', type: ArtType.Snap })
  ).resolves.toBe('https://retroachievements.test/Images/screenshot.png');
  await expect(
    client.findArtwork({ filePath: romPath, machine: 'Nintendo - Game Boy Color', type: ArtType.Title })
  ).resolves.toBe('https://retroachievements.test/Images/title.png');

  expect(hashRom).toHaveBeenCalledOnce();
  expect(hashRom).toHaveBeenCalledWith(6, romPath);
  expect(requestUrls.filter((url) => url.pathname.endsWith('/API_GetGameList.php'))).toHaveLength(1);
  expect(requestUrls.filter((url) => url.pathname.endsWith('/API_GetGameExtended.php'))).toHaveLength(1);
  expect(requestUrls.every((url) => url.searchParams.get('y') === 'personal-key')).toBe(true);
  expect(stats.matches.perfect).toBe(1);
});

test('returns no provider artwork when the ROM hash is unknown', async () => {
  const romPath = path.join(temporaryDirectory, 'Homebrew.gbc');
  await fs.writeFile(romPath, 'unknown-rom');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json([{ ID: 123, Hashes: ['different-hash'] }]))
  );
  const client = new RetroAchievementsClient({ credentials, hashRom: async () => 'unknown-hash' });

  await expect(
    client.findArtwork({ filePath: romPath, machine: 'Nintendo - Game Boy Color', type: ArtType.Boxart })
  ).resolves.toBeUndefined();
  expect(stats.matches.perfect).toBe(0);
});

test('uses the official rcheevos hashing implementation', async () => {
  const romPath = path.join(temporaryDirectory, 'Test.gbc');
  await fs.writeFile(romPath, Buffer.alloc(32_768));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = requestUrl(input);
      if (url.pathname.endsWith('/API_GetGameList.php')) {
        return Response.json([{ ID: 42, Hashes: ['bb7df04e1b0a2570657527a7e108ae23'] }]);
      }

      return Response.json({ ID: 42, ImageBoxArt: '/Images/official-hash.png' });
    })
  );
  const client = new RetroAchievementsClient({ credentials });

  await expect(
    client.findArtwork({ filePath: romPath, machine: 'Nintendo - Game Boy Color', type: ArtType.Boxart })
  ).resolves.toBe('https://retroachievements.test/Images/official-hash.png');
});

test('does not accept an invalid Web API key', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('Unauthorized', { status: 401 }))
  );
  const client = new RetroAchievementsClient({ credentials });
  await expect(client.authenticate()).rejects.toThrow('rejected this username or Web API key');
});

function requestUrl(input: string | URL | Request) {
  if (typeof input === 'string') return new URL(input);
  if (input instanceof URL) return input;
  return new URL(input.url);
}
