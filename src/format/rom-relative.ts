import fs from 'node:fs/promises';
import path from 'node:path';
import createDebug from 'debug';
import glob from 'fast-glob';
import { composeImageTo, resizeImageTo } from '../image.js';
import { type Options } from '../options.js';
import { type ArtType } from '../art.js';
import { type OutputFormat } from './format.js';

export type RomRelativeLayout = {
  name: string;
  mediaFolder?: string;
  keepRomExtension?: boolean;
};

/**
 Creates an adapter for frontends which discover one PNG at a predictable path
 relative to each ROM. The individual CFW modules are intentionally declarative:
 they only describe their filesystem convention.
 */
export function createRomRelativeFormat(layout: RomRelativeLayout): OutputFormat {
  const debug = createDebug(layout.name);

  return {
    async useSeparateArtworks(_options: Options) {
      return false;
    },

    async getArtPath(filePath: string, _machine: string, _type?: ArtType) {
      const basename = layout.keepRomExtension
        ? path.basename(filePath)
        : path.basename(filePath, path.extname(filePath));
      return path.join(path.dirname(filePath), layout.mediaFolder ?? '', `${basename}.png`);
    },

    async exportArtwork(art1Url: string | undefined, art2Url: string | undefined, artPath: string, options: Options) {
      const usesComposite = options.type.includes('+');
      if (usesComposite && (art1Url ?? art2Url)) {
        debug(`Found art URL(s): "${art1Url}" / "${art2Url}"`);
        return composeImageTo(art1Url, art2Url, artPath, { width: options.width, height: options.height });
      }

      if (art1Url) {
        debug(`Found art URL: "${art1Url}"`);
        return resizeImageTo(art1Url, artPath, { width: options.width, height: options.height });
      }

      return false;
    },

    async cleanupArtwork(targetPath: string, romFolders: string[], _options: Options) {
      if (!layout.mediaFolder) {
        console.info(`No artwork folders to clean up for ${layout.name} format`);
        return;
      }

      let removed = 0;
      for (const romFolder of romFolders) {
        const romPath = path.join(targetPath, romFolder);
        const folders = await glob([`**/${layout.mediaFolder}`], { onlyDirectories: true, cwd: romPath });
        await Promise.all(folders.map(async (folder) => fs.rm(path.join(romPath, folder), { recursive: true })));
        removed += folders.length;
      }

      console.info(`Removed ${removed} ${layout.mediaFolder} folders`);
    }
  };
}
