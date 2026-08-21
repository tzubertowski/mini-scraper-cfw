import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { detectFormat, scanLibrary, scrapeLibrary } from '../../src/core/index.js';
import { createOptions } from '../helpers/options.js';

const temporaryPaths: string[] = [];

afterEach(async () => {
  const paths = [...temporaryPaths];
  temporaryPaths.length = 0;
  await Promise.all(paths.map(async (targetPath) => fs.rm(targetPath, { recursive: true })));
});

async function createRoot(name: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `mini-scraper-${name}-`));
  temporaryPaths.push(root);
  return root;
}

describe('reusable scraper core', () => {
  test('discovers systems and games below a case-insensitive ROM root', async () => {
    const root = await createRoot('library');
    await fs.mkdir(path.join(root, 'roms', 'GBC'), { recursive: true });
    await fs.mkdir(path.join(root, 'roms', 'GBA'), { recursive: true });
    await fs.writeFile(path.join(root, 'roms', 'GBC', 'Shantae.gbc'), 'rom');
    await fs.writeFile(path.join(root, 'roms', 'GBC', 'Readme.txt'), 'ignore');
    await fs.writeFile(path.join(root, 'roms', 'GBA', 'Apotris.gba'), 'rom');

    const library = await scanLibrary(root);

    expect(library.romRootPath).toBe(path.join(root, 'roms'));
    expect(library.totalGames).toBe(2);
    expect(library.systems.map(({ name, gameCount }) => ({ name, gameCount }))).toEqual([
      { name: 'GBA', gameCount: 1 },
      { name: 'GBC', gameCount: 1 }
    ]);
  });

  test('accepts a single system folder without changing the process working directory', async () => {
    const root = await createRoot('single');
    const systemPath = path.join(root, 'GBC');
    await fs.mkdir(systemPath);
    await fs.writeFile(path.join(systemPath, 'Shantae.gbc'), 'rom');

    const library = await scanLibrary(systemPath);

    expect(library.romRootPath).toBe(root);
    expect(library.systems).toHaveLength(1);
    expect(library.systems[0]?.path).toBe(systemPath);
  });

  test('does not mistake a card label for a system or scrape firmware archives', async () => {
    const parent = await createRoot('card-label');
    const root = path.join(parent, 'ROMS1');
    await fs.mkdir(path.join(root, 'MUOS', 'PortMaster'), { recursive: true });
    await fs.mkdir(path.join(root, 'ROMS', 'GBA'), { recursive: true });
    await fs.writeFile(path.join(root, 'MUOS', 'PortMaster', 'pylibs.zip'), 'not a game');
    await fs.writeFile(path.join(root, 'ROMS', 'GBA', 'Apotris.gba'), 'game');

    const library = await scanLibrary(root);

    expect(library.romRootPath).toBe(path.join(root, 'ROMS'));
    expect(library.systems).toHaveLength(1);
    expect(library.systems[0]?.name).toBe('GBA');
    expect(library.totalGames).toBe(1);
  });

  test('uses scored evidence for confident and ambiguous frontend detection', async () => {
    const treefrogRoot = await createRoot('treefrog');
    await fs.mkdir(path.join(treefrogRoot, 'frogui'));
    await fs.mkdir(path.join(treefrogRoot, 'cubegm'));
    await fs.mkdir(path.join(treefrogRoot, 'roms', 'GBA'), { recursive: true });
    const treefrogLibrary = await scanLibrary(treefrogRoot);

    await expect(detectFormat(treefrogLibrary)).resolves.toMatchObject({
      format: 'treefrogui',
      confidence: 1
    });

    const ambiguousRoot = await createRoot('ambiguous');
    await fs.mkdir(path.join(ambiguousRoot, '.system'));
    await fs.mkdir(path.join(ambiguousRoot, 'Roms', 'GBC'), { recursive: true });
    const ambiguousLibrary = await scanLibrary(ambiguousRoot);
    const ambiguous = await detectFormat(ambiguousLibrary);
    expect(ambiguous.format).toBeUndefined();
    expect(ambiguous.candidates[0]?.score).toBe(15);
  });

  test('detects ES-DE beside a selected ROM directory', async () => {
    const root = await createRoot('esde');
    await fs.mkdir(path.join(root, 'ROMs', 'gba'), { recursive: true });
    await fs.writeFile(path.join(root, 'ROMs', 'gba', 'Apotris.gba'), 'rom');
    await fs.mkdir(path.join(root, 'ES-DE', 'settings'), { recursive: true });
    await fs.writeFile(path.join(root, 'ES-DE', 'settings', 'es_settings.xml'), '<settings/>');
    await fs.mkdir(path.join(root, 'ES-DE', 'downloaded_media'), { recursive: true });
    const library = await scanLibrary(path.join(root, 'ROMs'));

    await expect(detectFormat(library)).resolves.toMatchObject({ format: 'esde', confidence: 1 });
  });

  test('returns a structured cancelled result', async () => {
    const root = await createRoot('cancel');
    await fs.mkdir(path.join(root, 'Roms', 'GBC'), { recursive: true });
    await fs.writeFile(path.join(root, 'Roms', 'GBC', 'Shantae.gbc'), 'rom');
    const library = await scanLibrary(root);
    const controller = new AbortController();
    controller.abort();

    const result = await scrapeLibrary(library, createOptions(), { signal: controller.signal });

    expect(result).toMatchObject({ cancelled: true, games: 0, systems: 1 });
  });
});
