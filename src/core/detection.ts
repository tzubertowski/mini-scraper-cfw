import fs from 'node:fs/promises';
import path from 'node:path';
import { type Dirent } from 'node:fs';
import { type LibraryScan } from './library.js';

export type DetectionCandidate = {
  format: string;
  label: string;
  score: number;
  evidence: string[];
};

export type FormatDetection = {
  format?: string;
  confidence: number;
  candidates: DetectionCandidate[];
};

type Signature = { path: string; weight: number };
type DetectionProfile = { format: string; label: string; signatures: Signature[] };

const profiles: DetectionProfile[] = [
  {
    format: 'esde',
    label: 'ES-DE',
    signatures: [
      { path: 'ES-DE/settings/es_settings.xml', weight: 65 },
      { path: 'ES-DE/downloaded_media', weight: 30 },
      { path: 'ES-DE/gamelists', weight: 20 },
      { path: 'ES-DE', weight: 15 }
    ]
  },
  {
    format: 'muos',
    label: 'muOS',
    signatures: [
      { path: 'MUOS', weight: 65 },
      { path: 'MUOS/info/catalogue', weight: 25 },
      { path: 'autorun.inf', weight: 15 }
    ]
  },
  {
    format: 'treefrogui',
    label: 'TreeFrogUI',
    signatures: [
      { path: 'frogui', weight: 65 },
      { path: 'cubegm', weight: 25 },
      { path: 'roms', weight: 10 }
    ]
  },
  {
    format: 'knulli',
    label: 'Knulli',
    signatures: [
      { path: 'userdata/system/batocera.conf', weight: 70 },
      { path: 'system/batocera.conf', weight: 70 },
      { path: 'userdata/roms', weight: 15 },
      { path: 'system', weight: 10 }
    ]
  },
  {
    format: 'onionos',
    label: 'OnionOS',
    signatures: [
      { path: '.tmp_update', weight: 55 },
      { path: 'Emu', weight: 20 },
      { path: 'Themes', weight: 10 },
      { path: 'Roms', weight: 5 }
    ]
  },
  {
    format: 'garlicos',
    label: 'GarlicOS',
    signatures: [
      { path: 'CFW', weight: 55 },
      { path: 'Roms', weight: 10 },
      { path: 'BIOS', weight: 10 },
      { path: 'Saves', weight: 5 }
    ]
  },
  {
    format: 'spruceos',
    label: 'SpruceOS',
    signatures: [
      { path: 'spruce', weight: 70 },
      { path: 'Emu', weight: 10 },
      { path: 'Roms', weight: 5 }
    ]
  },
  {
    format: 'alliumos',
    label: 'AlliumOS',
    signatures: [
      { path: 'allium', weight: 70 },
      { path: 'Roms', weight: 5 },
      { path: 'BIOS', weight: 5 }
    ]
  },
  {
    format: 'nextui',
    label: 'NextUI',
    signatures: [
      { path: 'NextUI.zip', weight: 75 },
      { path: '.system', weight: 10 },
      { path: 'Roms', weight: 5 }
    ]
  },
  {
    format: 'minui',
    label: 'MinUI',
    signatures: [
      { path: 'MinUI.zip', weight: 75 },
      { path: '.system', weight: 10 },
      { path: 'Roms', weight: 5 }
    ]
  }
];

async function inventory(rootPath: string, depth = 3) {
  const found = new Set<string>();

  async function visit(folderPath: string, relativePath: string, remaining: number) {
    if (remaining < 0) return;
    let entries: Dirent[];
    try {
      entries = await fs.readdir(folderPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const relative = path.join(relativePath, entry.name);
      found.add(relative.replaceAll(path.sep, '/').toLowerCase());
      if (entry.isDirectory()) await visit(path.join(folderPath, entry.name), relative, remaining - 1);
    }
  }

  await visit(rootPath, '', depth);
  return found;
}

export async function detectFormat(library: LibraryScan): Promise<FormatDetection> {
  const inventoryRoots = new Set([library.selectedPath, path.dirname(library.romRootPath)]);
  const inventories = await Promise.all([...inventoryRoots].map(async (rootPath) => inventory(rootPath)));
  const files = new Set(inventories.flatMap((entries) => [...entries]));
  const candidates = profiles
    .map((profile) => {
      const evidence = profile.signatures
        .filter((signature) => files.has(signature.path.toLowerCase()))
        .map((signature) => signature.path);
      const score = profile.signatures
        .filter((signature) => files.has(signature.path.toLowerCase()))
        .reduce((total, signature) => total + signature.weight, 0);
      return { format: profile.format, label: profile.label, score: Math.min(score, 100), evidence };
    })
    .filter((candidate) => candidate.score > 0)
    .toSorted((left, right) => right.score - left.score);

  const best = candidates[0];
  const runnerUp = candidates[1];
  const isConfident = best && best.score >= 45 && best.score - (runnerUp?.score ?? 0) >= 15;
  return {
    format: isConfident ? best.format : undefined,
    confidence: best ? best.score / 100 : 0,
    candidates
  };
}
