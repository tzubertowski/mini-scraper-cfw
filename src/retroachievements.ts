import fs from 'node:fs/promises';
import path from 'node:path';
import { ArtType } from './art.js';
import { type DownloadManager } from './cache.js';
import { type RetroAchievementsCredentials } from './options.js';
import { stats } from './stats.js';
import { type ArtworkProvider, type ArtworkQuery } from './source.js';

const DEFAULT_BASE_URL = 'https://retroachievements.org';
const MAX_IN_MEMORY_ROM_SIZE = 512 * 1024 * 1024;

type JsonObject = Record<string, unknown>;
type RomHasher = (consoleId: number, filePath: string) => Promise<string | undefined>;
type RCheevosModule = {
  RCheevos: {
    initialize(): Promise<{ computeHash(consoleId: number, file: ArrayBuffer): string | undefined }>;
  };
};

export type RetroAchievementsClientOptions = {
  credentials: RetroAchievementsCredentials;
  downloadManager?: DownloadManager;
  signal?: AbortSignal;
  hashRom?: RomHasher;
};

const consoleIds: Record<string, number> = {
  'Nintendo - Game Boy Color': 6,
  'Nintendo - Game Boy Advance': 5,
  'Nintendo - Game Boy': 4,
  'Nintendo - Super Nintendo Entertainment System': 3,
  'Nintendo - Nintendo 64DD': 2,
  'Nintendo - Nintendo 64': 2,
  'Nintendo - Family Computer Disk System': 81,
  'Nintendo - Nintendo DSi': 78,
  'Nintendo - Nintendo DS': 18,
  'Nintendo - Nintendo Entertainment System': 7,
  'Nintendo - Pokemon Mini': 24,
  'Nintendo - Virtual Boy': 28,
  'Handheld Electronic Game': 60,
  'Sega - 32X': 10,
  'Sega - Dreamcast': 40,
  'Sega - Mega-CD - Sega CD': 9,
  'Sega - Mega Drive - Genesis': 1,
  'Sega - Game Gear': 15,
  'Sega - Master System - Mark III': 11,
  'Sega - Saturn': 39,
  'Sony - PlayStation Portable': 41,
  'Sony - PlayStation': 12,
  'Sega - Naomi 2': 27,
  'Sega - Naomi': 27,
  'Amstrad - CPC': 37,
  'Atari - ST': 36,
  'Atari - 5200': 50,
  'Atari - 7800': 51,
  'Atari - Jaguar': 17,
  'Atari - Lynx': 13,
  'Atari - 2600': 25,
  'Bandai - WonderSwan Color': 53,
  'Bandai - WonderSwan': 53,
  'Coleco - ColecoVision': 44,
  'Commodore - Amiga': 35,
  'Commodore - VIC-20': 34,
  'Commodore - 64': 30,
  'FBNeo - Arcade Games': 27,
  'GCE - Vectrex': 46,
  MAME: 27,
  'Microsoft - MSX2': 29,
  'Microsoft - MSX': 29,
  'Mattel - Intellivision': 45,
  'NEC - PC Engine CD - TurboGrafx-CD': 76,
  'NEC - PC Engine SuperGrafx': 8,
  'NEC - PC Engine - TurboGrafx 16': 8,
  'SNK - Neo Geo CD': 56,
  'SNK - Neo Geo Pocket Color': 14,
  'SNK - Neo Geo Pocket': 14,
  'SNK - Neo Geo': 27,
  'Magnavox - Odyssey2': 23,
  'TIC-80': 65,
  'Sharp - X68000': 52,
  'Watara - Supervision': 63,
  DOS: 26,
  Atomiswave: 27
};

export class RetroAchievementsClient implements ArtworkProvider {
  private readonly credentials: RetroAchievementsCredentials;
  private readonly baseUrl: string;
  private readonly downloadManager?: DownloadManager;
  private readonly signal?: AbortSignal;
  private readonly hashRom: RomHasher;
  private readonly gameLists = new Map<number, Promise<JsonObject[]>>();
  private readonly games = new Map<string, Promise<JsonObject | undefined>>();
  private readonly details = new Map<number, Promise<JsonObject>>();

  constructor(options: RetroAchievementsClientOptions) {
    this.credentials = options.credentials;
    this.baseUrl = (options.credentials.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/v, '');
    this.downloadManager = options.downloadManager;
    this.signal = options.signal;
    this.hashRom = options.hashRom ?? defaultHashRom;
  }

  get id() {
    return 'retroachievements';
  }

  async authenticate() {
    const profile = await this.request('API_GetUserProfile.php', { u: this.credentials.username }, false);
    const username = isObject(profile) ? stringValue(profile.User ?? profile.user) : undefined;
    if (!username) throw new Error('RetroAchievements rejected this username or Web API key.');
    return { username };
  }

  async findArtwork(query: ArtworkQuery) {
    const game = await this.getGame(query.filePath, query.machine);
    if (!game) return undefined;
    const id = numberValue(game.ID ?? game.id);
    if (id === undefined) return undefined;
    const details = await this.getDetails(id);
    const mediaPath = mediaValue(details, query.type);
    return mediaPath ? new URL(mediaPath, `${this.baseUrl}/`).href : undefined;
  }

  // Keep the public provider methods together above the internal request pipeline.
  // eslint-disable-next-line unicorn/consistent-class-member-order
  private async getGame(filePath: string, machine: string) {
    const key = `${machine}\0${filePath}`;
    const existing = this.games.get(key);
    if (existing) return existing;
    const pending = this.findGame(filePath, machine);
    this.games.set(key, pending);
    return pending;
  }

  private async findGame(filePath: string, machine: string) {
    const consoleId = consoleIds[machine];
    if (consoleId === undefined) return undefined;
    const hash = await this.hashRom(consoleId, filePath);
    if (!hash) return undefined;
    const games = await this.getGameList(consoleId);
    const normalizedHash = hash.toLowerCase();
    const game = games.find((candidate) => hashes(candidate).some((value) => value.toLowerCase() === normalizedHash));
    if (game) stats.matches.perfect++;
    return game;
  }

  private async getGameList(consoleId: number) {
    const existing = this.gameLists.get(consoleId);
    if (existing) return existing;
    const pending = this.request('API_GetGameList.php', { i: String(consoleId), h: '1', f: '0' }).then((value) =>
      Array.isArray(value) ? value.filter(isObject) : []
    );
    this.gameLists.set(consoleId, pending);
    return pending;
  }

  private async getDetails(gameId: number) {
    const existing = this.details.get(gameId);
    if (existing) return existing;
    const pending = this.request('API_GetGameExtended.php', { i: String(gameId) }).then((value) =>
      isObject(value) ? value : {}
    );
    this.details.set(gameId, pending);
    return pending;
  }

  private async request(endpoint: string, parameters: Record<string, string>, useCache = true): Promise<unknown> {
    const url = new URL(`/API/${endpoint}`, `${this.baseUrl}/`);
    url.search = new URLSearchParams({ y: this.credentials.webApiKey, ...parameters }).toString();
    this.signal?.throwIfAborted();

    if (useCache && this.downloadManager) {
      try {
        const result = await this.downloadManager.get(url.href, this.signal);
        try {
          return parseResponse(new TextDecoder().decode(result.buffer));
        } catch (error: unknown) {
          await this.downloadManager.invalidate(url.href);
          throw error;
        }
      } catch (error: unknown) {
        this.signal?.throwIfAborted();
        if (error instanceof Error && error.message.startsWith('RetroAchievements returned')) throw error;
        // Do not attach the original error: DownloadManager messages contain the credential-bearing request URL.
        // eslint-disable-next-line preserve-caught-error
        throw new Error('RetroAchievements metadata request failed after automatic retries.');
      }
    }

    const response = await fetch(url, { signal: this.signal });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('RetroAchievements rejected this username or Web API key.');
      }

      throw new Error(`RetroAchievements returned HTTP ${response.status}.`);
    }

    return parseResponse(await response.text());
  }
}

export async function authenticateRetroAchievements(options: RetroAchievementsClientOptions) {
  return new RetroAchievementsClient(options).authenticate();
}

async function defaultHashRom(consoleId: number, filePath: string) {
  try {
    const info = await fs.stat(filePath);
    if (!info.isFile() || path.extname(filePath).toLowerCase() === '.m3u' || info.size > MAX_IN_MEMORY_ROM_SIZE) {
      return undefined;
    }

    const file = await fs.readFile(filePath);
    const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
    const { RCheevos } = (await import('rcheevos')) as unknown as RCheevosModule;
    const hasher = await RCheevos.initialize();
    return hasher.computeHash(consoleId, buffer) ?? undefined;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

function hashes(game: JsonObject) {
  const value = game.Hashes ?? game.hashes;
  return Array.isArray(value) ? value.filter((hash): hash is string => typeof hash === 'string') : [];
}

function mediaValue(game: JsonObject, type: ArtType) {
  const keys: Record<ArtType, string[]> = {
    [ArtType.Boxart]: ['ImageBoxArt', 'imageBoxArt'],
    [ArtType.Snap]: ['ImageIngame', 'imageIngame'],
    [ArtType.Title]: ['ImageTitle', 'imageTitle']
  };
  for (const key of keys[type]) {
    const value = stringValue(game[key]);
    if (value) return value;
  }

  return undefined;
}

function parseResponse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(
      text.trim()
        ? `RetroAchievements returned an invalid response: ${text.trim().slice(0, 160)}`
        : 'RetroAchievements returned an empty response.'
    );
  }
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function numberValue(value: unknown) {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  if (typeof value === 'string' && /^\d+$/v.test(value)) return Number(value);
  return undefined;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
