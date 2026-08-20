import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ArtType } from '../../src/art.js';
import anbernic from '../../src/format/anbernic.js';
import funkey from '../../src/format/funkey.js';
import { getOutputFormat, supportedFormats } from '../../src/format/format.js';
import knulli from '../../src/format/knulli.js';
import minui from '../../src/format/minui.js';
import muos from '../../src/format/muos.js';
import nextui from '../../src/format/nextui.js';
import treefrogui from '../../src/format/treefrogui.js';
import { createOptions } from '../helpers/options.js';

const temporaryPaths: string[] = [];

afterEach(async () => {
  const pendingPaths = [...temporaryPaths];
  temporaryPaths.length = 0;
  await Promise.all(pendingPaths.map(async (targetPath) => fs.rm(targetPath, { recursive: true })));
  vi.restoreAllMocks();
});

describe('output formats', () => {
  test('generates paths for each supported layout', async () => {
    const filePath = path.join('GBC', 'Wario Land 3.zip');

    await expect(minui.getArtPath(filePath, 'Nintendo - Game Boy Color')).resolves.toBe(
      path.join('GBC', '.res', 'Wario Land 3.zip.png')
    );
    await expect(nextui.getArtPath(filePath, 'Nintendo - Game Boy Color')).resolves.toBe(
      path.join('GBC', '.media', 'Wario Land 3.png')
    );
    await expect(treefrogui.getArtPath(filePath, 'Nintendo - Game Boy Color')).resolves.toBe(
      path.join('GBC', '.res', 'Wario Land 3.png')
    );
    await expect(anbernic.getArtPath(filePath, 'Nintendo - Game Boy Color')).resolves.toBe(
      path.join('GBC', 'Imgs', 'Wario Land 3.png')
    );
    await expect(funkey.getArtPath(filePath, 'Nintendo - Game Boy Color')).resolves.toBe(
      path.join('GBC', 'Wario Land 3.png')
    );
  });

  test('maps Onion to the Anbernic implementation', async () => {
    const onion = await getOutputFormat(createOptions({ output: 'onion' }));
    const onionOs = await getOutputFormat(createOptions({ output: 'OnionOS' }));
    const garlicOs = await getOutputFormat(createOptions({ output: 'garlicos' }));
    const spruceOs = await getOutputFormat(createOptions({ output: 'spruceos' }));
    const alliumOs = await getOutputFormat(createOptions({ output: 'allium' }));
    expect(onion).toBe(anbernic);
    expect(onionOs).toBe(anbernic);
    expect(garlicOs).toBe(anbernic);
    expect(spruceOs).toBe(anbernic);
    expect(alliumOs).toBe(anbernic);
    expect(supportedFormats).toEqual(
      expect.arrayContaining([
        'minui',
        'nextui',
        'muos',
        'knulli',
        'treefrogui',
        'onionos',
        'garlicos',
        'spruceos',
        'alliumos'
      ])
    );
  });

  test('writes Knulli media paths and preserves existing gamelist metadata', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mini-scraper-knulli-'));
    temporaryPaths.push(root);
    const folderPath = path.join(root, 'GBC');
    const romPath = path.join(folderPath, 'Hacks', 'Wario Land 3.zip');
    await fs.mkdir(path.dirname(romPath), { recursive: true });
    await fs.writeFile(romPath, 'rom');
    await fs.writeFile(
      path.join(folderPath, 'gamelist.xml'),
      '<?xml version="1.0"?><gameList><game><path>./Hacks/Wario Land 3.zip</path><name>Custom name</name><desc>Keep me</desc></game><game><path>./Other.zip</path><favorite>true</favorite></game></gameList>'
    );

    const artworkPath = await knulli.getArtPath(romPath, 'Nintendo - Game Boy Color', ArtType.Boxart, folderPath);
    expect(artworkPath).toBe(path.join(folderPath, 'images', 'Wario Land 3-box.png'));
    await knulli.registerArtwork?.({
      folderPath,
      romPath,
      artworkPath,
      machine: 'Nintendo - Game Boy Color',
      type: ArtType.Boxart,
      options: createOptions({ output: 'knulli' })
    });
    await knulli.finalizeMachine?.(folderPath, 'Nintendo - Game Boy Color', createOptions({ output: 'knulli' }));

    const gameList = await fs.readFile(path.join(folderPath, 'gamelist.xml'), 'utf8');
    expect(gameList).toContain('<name>Custom name</name>');
    expect(gameList).toContain('<desc>Keep me</desc>');
    expect(gameList).toContain('<boxart>./images/Wario Land 3-box.png</boxart>');
    expect(gameList).toContain('<favorite>true</favorite>');
  });

  test('scopes cleanup to selected ROM folders with glob characters', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mini-scraper-cleanup-'));
    temporaryPaths.push(root);
    const selected = path.join(root, 'Game Boy (GB)', 'Hacks', '.res');
    const untouched = path.join(root, 'GBC', '.res');
    await fs.mkdir(selected, { recursive: true });
    await fs.mkdir(untouched, { recursive: true });

    await minui.cleanupArtwork(root, ['Game Boy (GB)'], createOptions());

    await expect(fs.access(selected)).rejects.toThrow();
    await expect(fs.access(untouched)).resolves.toBeUndefined();
  });

  test('prepares muOS paths and theme overrides from the volume root', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mini-scraper-muos-'));
    temporaryPaths.push(root);
    await fs.writeFile(path.join(root, 'autorun.inf'), '');
    const romFolder = path.join(root, 'GBC');
    await fs.mkdir(romFolder);
    const existingOverride = path.join(root, 'theme', 'override', 'muxplore.txt');
    await fs.mkdir(path.dirname(existingOverride), { recursive: true });
    await fs.writeFile(existingOverride, '[misc]\nCONTENT_WIDTH=320\n');
    const options = createOptions({ output: 'muos', width: 240 });

    await muos.prepareMachine(romFolder, 'Nintendo - Game Boy Color', options);
    await expect(
      muos.getArtPath(path.join(romFolder, 'Wario Land 3.zip'), 'Nintendo - Game Boy Color', ArtType.Boxart)
    ).resolves.toBe(path.join(root, 'MUOS', 'info', 'catalogue', 'Nintendo Game Boy Color', 'box', 'Wario Land 3.png'));
    await expect(fs.readFile(existingOverride, 'utf8')).resolves.toContain('CONTENT_WIDTH=240');
  });
});
