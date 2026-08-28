import fs from 'node:fs/promises';
import path from 'node:path';
import createDebug from 'debug';
import { ArtType } from '../art.js';
import { resizeImageTo } from '../image.js';
import { getMachine } from '../libretro.js';
import { ArtTypeOption, type Options } from '../options.js';
import { type OutputFormat } from './format.js';

const debug = createDebug('esde');

const mediaFolders: Record<ArtType, string> = {
  [ArtType.Boxart]: 'covers',
  [ArtType.Snap]: 'screenshots',
  [ArtType.Title]: 'titlescreens'
};

const systemNames: Record<string, string> = {
  'Nintendo - Game Boy Color': 'gbc',
  'Nintendo - Game Boy Advance': 'gba',
  'Nintendo - Game Boy': 'gb',
  'Nintendo - Super Nintendo Entertainment System': 'snes',
  'Nintendo - Nintendo 64DD': 'n64dd',
  'Nintendo - Nintendo 64': 'n64',
  'Nintendo - Family Computer Disk System': 'fds',
  'Nintendo - Nintendo DSi': 'dsiware',
  'Nintendo - Nintendo DS': 'nds',
  'Nintendo - Nintendo Entertainment System': 'nes',
  'Nintendo - Pokemon Mini': 'pokemini',
  'Nintendo - Virtual Boy': 'virtualboy',
  'Handheld Electronic Game': 'gameandwatch',
  'Sega - 32X': 'sega32x',
  'Sega - Dreamcast': 'dreamcast',
  'Sega - Mega-CD - Sega CD': 'segacd',
  'Sega - Mega Drive - Genesis': 'megadrive',
  'Sega - Game Gear': 'gamegear',
  'Sega - Master System - Mark III': 'mastersystem',
  'Sega - Saturn': 'saturn',
  'Sony - PlayStation Portable': 'psp',
  'Sony - PlayStation': 'psx',
  'Sega - Naomi 2': 'naomi2',
  'Sega - Naomi': 'naomi',
  'Amstrad - CPC': 'amstradcpc',
  'Atari - ST': 'atarist',
  'Atari - 2600': 'atari2600',
  'Atari - 5200': 'atari5200',
  'Atari - 7800': 'atari7800',
  'Atari - Jaguar': 'atarijaguar',
  'Atari - Lynx': 'atarilynx',
  'Bandai - WonderSwan Color': 'wonderswancolor',
  'Bandai - WonderSwan': 'wonderswan',
  'Coleco - ColecoVision': 'colecovision',
  'Commodore - Amiga': 'amiga',
  'Commodore - VIC-20': 'vic20',
  'Commodore - 64': 'c64',
  'FBNeo - Arcade Games': 'arcade',
  'GCE - Vectrex': 'vectrex',
  'GamePark - GP32': 'gp32',
  MAME: 'mame',
  'Microsoft - MSX2': 'msx2',
  'Microsoft - MSX': 'msx',
  'Mattel - Intellivision': 'intellivision',
  'NEC - PC Engine CD - TurboGrafx-CD': 'pcenginecd',
  'NEC - PC Engine SuperGrafx': 'supergrafx',
  'NEC - PC Engine - TurboGrafx 16': 'pcengine',
  'SNK - Neo Geo CD': 'neogeocd',
  'SNK - Neo Geo Pocket Color': 'ngpc',
  'SNK - Neo Geo Pocket': 'ngp',
  'SNK - Neo Geo': 'neogeo',
  'Magnavox - Odyssey2': 'odyssey2',
  'TIC-80': 'tic80',
  'Sharp - X68000': 'x68000',
  'Watara - Supervision': 'supervision',
  DOS: 'dos',
  DOOM: 'doom',
  ScummVM: 'scummvm',
  Atomiswave: 'atomiswave'
};

export function inferEsdeMediaPath(romRootPath: string) {
  return path.join(path.dirname(path.resolve(romRootPath)), 'ES-DE', 'downloaded_media');
}

export function getEsdeSystemName(machine: string, folderPath?: string) {
  return systemNames[machine] ?? path.basename(folderPath ?? machine).toLowerCase();
}

function selectedTypes(options: Options) {
  switch (options.type) {
    case ArtTypeOption.Boxart: {
      return [ArtType.Boxart];
    }

    case ArtTypeOption.Snap: {
      return [ArtType.Snap];
    }

    case ArtTypeOption.Title: {
      return [ArtType.Title];
    }

    case ArtTypeOption.BoxAndSnap: {
      return [ArtType.Boxart, ArtType.Snap];
    }

    case ArtTypeOption.BoxAndTitle: {
      return [ArtType.Boxart, ArtType.Title];
    }

    case ArtTypeOption.SnapAndBox: {
      return [ArtType.Snap, ArtType.Boxart];
    }

    case ArtTypeOption.TitleAndBox: {
      return [ArtType.Title, ArtType.Boxart];
    }
  }
}

const esde: OutputFormat = {
  async useSeparateArtworks(_options) {
    return true;
  },

  async getArtPath(filePath, machine, type, folderPath, options) {
    const resolvedType = type ?? ArtType.Boxart;
    const resolvedFolderPath = folderPath ?? path.dirname(filePath);
    const mediaPath = options?.mediaPath ?? inferEsdeMediaPath(path.dirname(resolvedFolderPath));
    const systemName = getEsdeSystemName(machine, resolvedFolderPath);
    const relativeRomPath = path.relative(resolvedFolderPath, filePath);
    const relativeArtworkPath = path.join(
      path.dirname(relativeRomPath),
      `${path.basename(relativeRomPath, path.extname(relativeRomPath))}.png`
    );
    return path.join(mediaPath, systemName, mediaFolders[resolvedType], relativeArtworkPath);
  },

  async exportArtwork(art1Url, _art2Url, artPath, options) {
    if (!art1Url) return false;
    debug(`Found art URL: "${art1Url}"`);
    return resizeImageTo(art1Url, artPath, {
      width: options.width,
      height: options.height,
      downloadManager: options.downloadManager
    });
  },

  async cleanupArtwork(targetPath, romFolders, options) {
    const mediaPath = options.mediaPath ?? inferEsdeMediaPath(targetPath);
    let removed = 0;
    for (const romFolder of romFolders) {
      const machine = getMachine(romFolder, true);
      if (!machine) continue;
      const systemName = getEsdeSystemName(machine, romFolder);
      for (const type of selectedTypes(options)) {
        await fs.rm(path.join(mediaPath, systemName, mediaFolders[type]), { recursive: true, force: true });
        removed++;
      }
    }

    console.info(`Removed ${removed} ES-DE media folders`);
  }
};

export default esde;
