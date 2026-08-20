import fs from 'node:fs/promises';
import path from 'node:path';
import { getMachine, isRomFolder, listScrapeFiles } from '../libretro.js';

export type SystemScan = {
  name: string;
  path: string;
  machine: string;
  gameCount: number;
};

export type LibraryScan = {
  selectedPath: string;
  romRootPath: string;
  systems: SystemScan[];
  totalGames: number;
};

async function directoryExists(targetPath: string) {
  try {
    const stats = await fs.stat(targetPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

async function findDirectory(parentPath: string, name: string) {
  if (!(await directoryExists(parentPath))) return undefined;
  const entries = await fs.readdir(parentPath, { withFileTypes: true });
  const match = entries.find((entry) => entry.isDirectory() && entry.name.toLowerCase() === name.toLowerCase());
  return match ? path.join(parentPath, match.name) : undefined;
}

async function countGames(folderPath: string, machine: string) {
  const files = await listScrapeFiles(folderPath, machine);
  return files.length;
}

async function scanRomRoot(romRootPath: string): Promise<SystemScan[]> {
  if (!(await directoryExists(romRootPath))) return [];
  const entries = await fs.readdir(romRootPath, { withFileTypes: true });
  const systems: SystemScan[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !isRomFolder(entry.name)) continue;
    const machine = getMachine(entry.name, true);
    if (!machine) continue;
    const systemPath = path.join(romRootPath, entry.name);
    systems.push({
      name: entry.name,
      path: systemPath,
      machine,
      gameCount: await countGames(systemPath, machine)
    });
  }

  return systems.toSorted((left, right) => left.name.localeCompare(right.name));
}

export async function scanLibrary(selectedPath: string): Promise<LibraryScan> {
  const absolutePath = path.resolve(selectedPath);
  if (!(await directoryExists(absolutePath))) throw new Error(`no such file or directory: ${absolutePath}`);

  const selectedName = path.basename(absolutePath);
  if (isRomFolder(selectedName)) {
    const machine = getMachine(selectedName, true)!;
    const system = {
      name: selectedName,
      path: absolutePath,
      machine,
      gameCount: await countGames(absolutePath, machine)
    };
    return {
      selectedPath: absolutePath,
      romRootPath: path.dirname(absolutePath),
      systems: [system],
      totalGames: system.gameCount
    };
  }

  const candidates = [
    await findDirectory(absolutePath, 'Roms'),
    path.join(absolutePath, 'userdata', 'roms'),
    absolutePath
  ].filter((candidate): candidate is string => Boolean(candidate));

  let best = { romRootPath: absolutePath, systems: [] as SystemScan[] };
  for (const candidate of new Set(candidates)) {
    const systems = await scanRomRoot(candidate);
    if (systems.length > best.systems.length) best = { romRootPath: candidate, systems };
  }

  return {
    selectedPath: absolutePath,
    romRootPath: best.romRootPath,
    systems: best.systems,
    totalGames: best.systems.reduce((total, system) => total + system.gameCount, 0)
  };
}
