/* eslint-disable unicorn/prefer-dom-node-append, unicorn/prefer-dom-node-remove -- xmldom does not implement append/remove */
import fs from 'node:fs/promises';
import path from 'node:path';
import { DOMImplementation, DOMParser, XMLSerializer } from '@xmldom/xmldom';
import createDebug from 'debug';
import glob from 'fast-glob';
import { ArtType } from '../art.js';
import { pathExists } from '../file.js';
import { resizeImageTo } from '../image.js';
import { ArtTypeOption, type Options } from '../options.js';
import { type ArtworkContext, type OutputFormat } from './format.js';

const debug = createDebug('knulli');
const mediaFolder = 'images';

const mediaTags: Record<ArtType, { suffix: string; tag: string }> = {
  [ArtType.Boxart]: { suffix: 'box', tag: 'boxart' },
  [ArtType.Snap]: { suffix: 'image', tag: 'image' },
  [ArtType.Title]: { suffix: 'titleshot', tag: 'titleshot' }
};

type PendingArtwork = {
  romPath: string;
  artworkPath: string;
  tag: string;
};

const pendingByFolder = new Map<string, PendingArtwork[]>();

function toPortablePath(value: string) {
  return value.replaceAll(path.sep, '/').replace(/^\.\//v, '');
}

function relativeReference(from: string, target: string) {
  return `./${toPortablePath(path.relative(from, target))}`;
}

// The xmldom NodeList is array-like but is not iterable at runtime.
function children(parent: Node): Node[] {
  return Array.prototype.slice.call(parent.childNodes) as Node[];
}

function directChild(parent: Element, tagName: string): Element | undefined {
  return children(parent).find(
    (node): node is Element => node.nodeType === node.ELEMENT_NODE && (node as Element).tagName === tagName
  );
}

function createTextElement(document: Document, name: string, value: string) {
  const element = document.createElement(name);
  element.appendChild(document.createTextNode(value));
  return element;
}

function parseGameList(xml: string | undefined) {
  if (!xml) {
    const document = new DOMImplementation().createDocument(null, 'gameList');
    return { document, root: document.documentElement };
  }

  const errors: string[] = [];
  const document = new DOMParser({
    errorHandler: {
      warning(message) {
        debug(`gamelist.xml warning: ${message}`);
      },
      error(message) {
        errors.push(message);
      },
      fatalError(message) {
        errors.push(message);
      }
    }
  }).parseFromString(xml, 'application/xml');
  const root = document.documentElement;
  if (errors.length > 0 || root.tagName !== 'gameList') {
    throw new Error(`Invalid Knulli gamelist.xml: ${errors[0] ?? 'missing <gameList> root'}`);
  }

  return { document, root };
}

async function readGameList(folderPath: string) {
  const gameListPath = path.join(folderPath, 'gamelist.xml');
  const xml = (await pathExists(gameListPath)) ? await fs.readFile(gameListPath, 'utf8') : undefined;
  return { gameListPath, ...parseGameList(xml) };
}

async function writeGameList(gameListPath: string, document: Document) {
  const serialized = new XMLSerializer().serializeToString(document);
  const xml = serialized.startsWith('<?xml') ? `${serialized}\n` : `<?xml version="1.0"?>\n${serialized}\n`;
  const temporaryPath = `${gameListPath}.mini-scraper.tmp`;
  await fs.writeFile(temporaryPath, xml);
  await fs.rename(temporaryPath, gameListPath);
}

function findGame(root: Element, romReference: string) {
  const normalizedReference = toPortablePath(romReference);
  return children(root).find((node): node is Element => {
    if (node.nodeType !== node.ELEMENT_NODE || (node as Element).tagName !== 'game') return false;
    const pathElement = directChild(node as Element, 'path');
    return pathElement ? toPortablePath(pathElement.textContent ?? '') === normalizedReference : false;
  });
}

function selectedTags(options: Options) {
  switch (options.type) {
    case ArtTypeOption.Boxart: {
      return ['boxart'];
    }

    case ArtTypeOption.Snap: {
      return ['image'];
    }

    case ArtTypeOption.Title: {
      return ['titleshot'];
    }

    case ArtTypeOption.BoxAndSnap: {
      return ['boxart', 'image'];
    }

    case ArtTypeOption.BoxAndTitle: {
      return ['boxart', 'titleshot'];
    }

    case ArtTypeOption.SnapAndBox: {
      return ['image', 'boxart'];
    }

    case ArtTypeOption.TitleAndBox: {
      return ['titleshot', 'boxart'];
    }
  }
}

function removeGeneratedMedia(root: Element, tags: string[]) {
  for (const game of children(root)) {
    if (game.nodeType !== game.ELEMENT_NODE || (game as Element).tagName !== 'game') continue;
    for (const tag of tags) {
      const media = directChild(game as Element, tag);
      if (media?.textContent?.startsWith(`./${mediaFolder}/`)) media.parentNode?.removeChild(media);
    }
  }
}

const knulli: OutputFormat = {
  async useSeparateArtworks(_options) {
    return true;
  },

  async getArtPath(filePath, _machine, type, folderPath) {
    const media = mediaTags[type ?? ArtType.Boxart];
    const basename = path.basename(filePath, path.extname(filePath));
    return path.join(folderPath ?? path.dirname(filePath), mediaFolder, `${basename}-${media.suffix}.png`);
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

  async registerArtwork(context: ArtworkContext) {
    const folderPath = path.resolve(context.folderPath);
    const pending = pendingByFolder.get(folderPath) ?? [];
    const item = {
      romPath: relativeReference(folderPath, context.romPath),
      artworkPath: relativeReference(folderPath, context.artworkPath),
      tag: mediaTags[context.type].tag
    };
    const existingIndex = pending.findIndex((entry) => entry.romPath === item.romPath && entry.tag === item.tag);
    if (existingIndex === -1) pending.push(item);
    else pending[existingIndex] = item;
    pendingByFolder.set(folderPath, pending);
  },

  async finalizeMachine(folderPath) {
    const absoluteFolder = path.resolve(folderPath);
    const pending = pendingByFolder.get(absoluteFolder) ?? [];
    pendingByFolder.delete(absoluteFolder);
    if (pending.length === 0) return;

    const { gameListPath, document, root } = await readGameList(folderPath);
    for (const item of pending) {
      let game = findGame(root, item.romPath);
      if (!game) {
        game = document.createElement('game');
        game.appendChild(createTextElement(document, 'path', item.romPath));
        const name = path.basename(item.romPath, path.extname(item.romPath));
        game.appendChild(createTextElement(document, 'name', name));
        root.appendChild(game);
      }

      const oldMedia = directChild(game, item.tag);
      if (oldMedia) oldMedia.textContent = item.artworkPath;
      else game.appendChild(createTextElement(document, item.tag, item.artworkPath));
    }

    await writeGameList(gameListPath, document);
    console.info(`Updated Knulli metadata: "${gameListPath}"`);
  },

  async cleanupArtwork(targetPath, romFolders, options) {
    const tags = selectedTags(options);
    let removed = 0;
    for (const romFolder of romFolders) {
      const folderPath = path.join(targetPath, romFolder);
      const suffixes = Object.values(mediaTags)
        .filter((media) => tags.includes(media.tag))
        .map((media) => media.suffix);
      const files = await glob(
        suffixes.map((suffix) => `${mediaFolder}/**/*-${suffix}.png`),
        { cwd: folderPath }
      );
      await Promise.all(files.map(async (file) => fs.rm(path.join(folderPath, file))));
      removed += files.length;

      const gameListPath = path.join(folderPath, 'gamelist.xml');
      if (!(await pathExists(gameListPath))) continue;
      const { document, root } = await readGameList(folderPath);
      removeGeneratedMedia(root, tags);
      await writeGameList(gameListPath, document);
    }

    console.info(`Removed ${removed} Knulli artwork files`);
  }
};

export default knulli;
