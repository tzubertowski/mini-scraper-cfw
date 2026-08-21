import process from 'node:process';
import path from 'node:path';
import createDebug from 'debug';
import glob from 'fast-glob';
import { ArtTypeOption, type Options } from './options.js';
import { findBestMatch, findFuzzyMatches } from './matcher.js';
import { stats } from './stats.js';
import { machines } from './machines.js';
import { getOutputFormat, type OutputFormat } from './format/format.js';
import { ArtType } from './art.js';
import { pathExists, sanitizeName, stripMetadata } from './file.js';
import { DownloadManager } from './cache.js';
import { RetroAchievementsClient } from './retroachievements.js';

const debug = createDebug('libretro');

export type MachineCache = Record<string, Partial<Record<ArtType, string[]>>>;
export type ScrapeFolderRuntime = {
  signal?: AbortSignal;
  onFileComplete?: (file: string) => void;
};

const defaultBaseUrl = 'https://thumbnails.libretro.com/';
const machineCache: MachineCache = {};

function normalizeFolderName(value: string) {
  return value
    .toLowerCase()
    .replaceAll(/[^0-9a-z]+/gv, ' ')
    .trim();
}

function matchesFolderAlias(folderName: string, alias: string) {
  const normalizedFolder = normalizeFolderName(folderName);
  const normalizedAlias = normalizeFolderName(alias);
  if (!normalizedAlias) return false;

  const compactFolder = normalizedFolder.replaceAll(' ', '');
  const compactAlias = normalizedAlias.replaceAll(' ', '');
  return compactFolder === compactAlias || ` ${normalizedFolder} `.includes(` ${normalizedAlias} `);
}

export function getMachine(file: string, isFolder = false) {
  const extension = file.split('.').pop() ?? '';
  const firstComponent = isFolder ? path.basename(file) : file.split(/\\|\//v, 1)[0];
  const machine = Object.entries(machines).find(
    ([_, { extensions, alias }]) =>
      (isFolder || extensions.includes(extension)) &&
      alias.some((a) => (isFolder ? matchesFolderAlias(firstComponent, a) : firstComponent.includes(a)))
  );
  return machine ? machine[0] : undefined;
}

export function isRomFolder(folderName: string) {
  return getMachine(folderName, true) !== undefined;
}

export async function listScrapeFiles(folderPath: string, machine: string) {
  const extensions = machines[machine]?.extensions ?? [];
  const files = await glob('**/*', {
    onlyFiles: true,
    cwd: folderPath,
    caseSensitiveMatch: false,
    followSymbolicLinks: false
  });
  const supportedExtensions = new Set(extensions.map((extension) => extension.toLowerCase()));
  const result: string[] = [];
  for (const file of files) {
    if (!supportedExtensions.has(path.extname(file).slice(1).toLowerCase())) continue;
    const absolutePath = path.join(folderPath, file);
    const m3uPath = absolutePath.replace(/ \(Disc \d+\).+$/v, '') + '.m3u';
    if (path.extname(absolutePath).toLowerCase() !== '.m3u' && (await pathExists(m3uPath))) continue;
    result.push(file);
  }

  return result;
}

export async function scrapeFolder(folderPath: string, options: Options, runtime: ScrapeFolderRuntime = {}) {
  options.downloadSignal = runtime.signal;
  options.downloadManager ??= new DownloadManager(options);
  debug('Options:', safeOptions(options));
  const folderMachine = getMachine(path.basename(folderPath), true);
  console.info(`Scraping folder: ${folderPath} [Detected: ${folderMachine}]`);
  if (!folderMachine) return;

  const files = await listScrapeFiles(folderPath, folderMachine);
  const format = await getOutputFormat(options);
  if (format.prepareMachine) await format.prepareMachine(folderPath, folderMachine, options);

  try {
    for (const file of files) {
      runtime.signal?.throwIfAborted();
      try {
        await scrapeFile(folderPath, file, folderMachine, format, options);
      } catch (_error: unknown) {
        const error = _error as Error;
        console.error(`Error while scraping artwork for file "${file}": ${error.message}`);
      }

      runtime.onFileComplete?.(file);
    }
  } finally {
    await format.finalizeMachine?.(folderPath, folderMachine, options);
  }

  debug('--------------------------------');
}

async function resolveScrapePath(originalFilePath: string, folderPath: string) {
  if (originalFilePath.endsWith('.m3u')) {
    const parentFolder = path.dirname(originalFilePath);
    if (parentFolder === folderPath) {
      debug(`File is m3u, parent folder is machine folder, continuing anyway: ${originalFilePath}`);
      return originalFilePath;
    }

    debug(`File is m3u, using parent folder for scraping: ${parentFolder}`);
    return parentFolder;
  }

  // Skip a multi-disc part when a matching "Rom Name.m3u" exists.
  const m3uPath = originalFilePath.replace(/ \(Disc \d+\).+$/v, '') + '.m3u';
  if (await pathExists(m3uPath)) {
    debug(`File is a multi-disc part, skipping: ${originalFilePath}`);
    return undefined;
  }

  return originalFilePath;
}

async function scrapeFile(folderPath: string, file: string, machine: string, format: OutputFormat, options: Options) {
  const originalFilePath = path.join(folderPath, file);
  const filePath = await resolveScrapePath(originalFilePath, folderPath);
  if (!filePath) return;

  const artTypes = getArtTypes(options);
  if (await format.useSeparateArtworks(options)) {
    const context = { folderPath, romPath: originalFilePath, searchPath: filePath, machine, format, options };
    await scrapeSeparateArtwork({ ...context, type: artTypes.art1 });
    if (artTypes.art2) {
      await scrapeSeparateArtwork({ ...context, type: artTypes.art2 });
    }

    return;
  }

  const artPath = await format.getArtPath(originalFilePath, machine, undefined, folderPath, options);
  if ((await pathExists(artPath)) && !options.force) {
    debug(`Art file already exists, skipping "${artPath}"`);
    stats.skipped++;
    return;
  }

  debug(`Machine: ${machine} (file: ${filePath})`);
  const art1Url = await findArtworkUrl(filePath, machine, options, artTypes.art1);
  const art2Url = artTypes.art2 ? await findArtworkUrl(filePath, machine, options, artTypes.art2) : undefined;
  const result = await format.exportArtwork(art1Url, art2Url, artPath, options);
  if (!result) console.info(`No art found for "${filePath}"`);
}

async function scrapeSeparateArtwork(context: {
  folderPath: string;
  romPath: string;
  searchPath: string;
  machine: string;
  type: ArtType;
  format: OutputFormat;
  options: Options;
}) {
  const { folderPath, romPath, searchPath, machine, type, format, options } = context;
  const artworkPath = await format.getArtPath(romPath, machine, type, folderPath, options);
  if ((await pathExists(artworkPath)) && !options.force) {
    debug(`Art file already exists, skipping "${artworkPath}"`);
    stats.skipped++;
  } else {
    debug(`Machine: ${machine} (file: ${searchPath})`);
    const artUrl = await findArtworkUrl(searchPath, machine, options, type);
    const result = await format.exportArtwork(artUrl, undefined, artworkPath, options);
    if (!result) {
      console.info(`No art found for "${searchPath}"`);
      return;
    }
  }

  await format.registerArtwork?.({ folderPath, romPath, artworkPath, machine, type, options });
}

export async function findArtworkUrl(
  filePath: string,
  machine: string,
  options: Options,
  type: ArtType = ArtType.Boxart
) {
  if ((options.artworkSource ?? 'automatic') === 'automatic') return findArtUrl(filePath, machine, options, type);
  if (!options.retroAchievementsCredentials) throw new Error('Connect RetroAchievements before scraping.');
  options.artworkProvider ??= new RetroAchievementsClient({
    credentials: options.retroAchievementsCredentials,
    downloadManager: options.downloadManager,
    signal: options.downloadSignal
  });
  const artwork = await options.artworkProvider.findArtwork({ filePath, machine, type });
  return artwork ?? findArtUrl(filePath, machine, options, type);
}

function safeOptions(options: Options) {
  const { retroAchievementsCredentials, artworkProvider, ...safe } = options;
  return {
    ...safe,
    artworkProvider: artworkProvider?.id,
    retroAchievementsCredentials: retroAchievementsCredentials
      ? { username: retroAchievementsCredentials.username, webApiKey: '[redacted]' }
      : undefined
  };
}

export async function findArtUrl(
  filePath: string,
  machine: string,
  options: Options,
  type: ArtType = ArtType.Boxart,
  fallback = true
): Promise<string | undefined> {
  const baseUrl = process.env.MSCRAPER_THUMBNAIL_URL ?? defaultBaseUrl;
  let arts = machineCache[machine]?.[type];
  if (!arts) {
    debug(`Fetching arts list for "${machine}" (${type})`);
    const artsPath = `${baseUrl}${machine}/${type}/`;
    const response = await fetch(artsPath);
    const text = await response.text();
    arts =
      text
        .match(/<a href="([^"]+)">/gv)
        ?.map((a) => a.replace(/<a href="([^"]+)">/v, '$1'))
        .map((a) => decodeURIComponent(a)) ?? [];
    machineCache[machine] ??= {};
    machineCache[machine][type] = arts;
  }

  const fileName = path.basename(filePath, path.extname(filePath));

  // Try exact match
  const pngName = sanitizeName(`${fileName}.png`);
  if (arts.includes(pngName)) {
    debug(`Found exact match for "${fileName}"`);
    stats.matches.perfect++;
    return `${baseUrl}${machine}/${type}/${pngName}`;
  }

  const findMatch = async (name: string) => {
    const matches = arts.filter((a) => a.includes(sanitizeName(name)));
    if (matches.length > 0) {
      const bestMatch = await findBestMatch(name, fileName, matches, options);
      if (!bestMatch) {
        return undefined;
      }

      return `${baseUrl}${machine}/${type}/${bestMatch}`;
    }

    return undefined;
  };

  // Try searching after removing (...) and [...] in the name
  let strippedName = stripMetadata(fileName);
  let match = await findMatch(strippedName);
  if (match) return match;

  // Try searching using fuzzy matching
  const matches: string[] = await findFuzzyMatches(sanitizeName(strippedName), arts, options);
  if (matches.length > 0) {
    const bestMatch = await findBestMatch(strippedName, fileName, matches, options);
    if (!bestMatch) {
      return undefined;
    }

    return `${baseUrl}${machine}/${type}/${bestMatch}`;
  }

  // Try searching after removing DX in the name
  strippedName = strippedName.replaceAll('DX', '').trim();
  match = await findMatch(strippedName);
  if (match) return match;

  // Try searching after removing substitles using ': '
  strippedName = strippedName.split(': ', 1)[0].trim();
  match = await findMatch(strippedName);
  if (match) return match;

  // Try searching after removing substitles using '- '
  strippedName = strippedName.split('- ', 1)[0].trim();
  match = await findMatch(strippedName);
  if (match) return match;

  // Try with fallback machines
  if (!fallback) return undefined;
  const fallbackMachines = machines[machine]?.fallbacks ?? [];
  for (const fallbackMachine of fallbackMachines) {
    const artUrl = await findArtUrl(filePath, fallbackMachine, options, type, false);
    if (artUrl) {
      debug(`Found match for "${fileName}" in fallback machine "${fallbackMachine}"`);
      return artUrl;
    }

    debug(`No match for "${fileName}" in fallback machine "${fallbackMachine}"`);
  }

  stats.matches.none++;
  return undefined;
}

export function getArtTypes(options: Options) {
  switch (options.type) {
    case ArtTypeOption.Boxart: {
      return { art1: ArtType.Boxart };
    }

    case ArtTypeOption.Snap: {
      return { art1: ArtType.Snap };
    }

    case ArtTypeOption.Title: {
      return { art1: ArtType.Title };
    }

    case ArtTypeOption.BoxAndSnap: {
      return { art1: ArtType.Boxart, art2: ArtType.Snap };
    }

    case ArtTypeOption.BoxAndTitle: {
      return { art1: ArtType.Boxart, art2: ArtType.Title };
    }

    // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
    default: {
      console.error(`Invalid art type: "${options.type as any}"`);
      process.exit(1);
    }
  }
}
