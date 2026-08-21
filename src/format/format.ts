import { type ArtType } from '../art.js';
import { type Options } from '../options.js';
import anbernic from './anbernic.js';
import funkey from './funkey.js';
import knulli from './knulli.js';
import minui from './minui.js';
import muos from './muos.js';
import nextui from './nextui.js';
import treefrogui from './treefrogui.js';
import esde from './esde.js';

export enum Format {
  MinUI = 'minui',
  NextUI = 'nextui',
  MuOS = 'muos',
  Knulli = 'knulli',
  TreeFrogUI = 'treefrogui',
  OnionOS = 'onionos',
  GarlicOS = 'garlicos',
  SpruceOS = 'spruceos',
  AlliumOS = 'alliumos',
  Anbernic = 'anbernic',
  Funkey = 'funkey',
  EsDe = 'esde',
  Onion = 'onion'
}

export type ArtworkContext = {
  folderPath: string;
  romPath: string;
  artworkPath: string;
  machine: string;
  type: ArtType;
  options: Options;
};

export type SeparateArtworksFunction = (options: Options) => Promise<boolean>;
export type PrepareMachineFunction = (folderPath: string, machine: string, options: Options) => Promise<void>;
export type OutputPathFunction = (
  filePath: string,
  machine: string,
  type?: ArtType,
  folderPath?: string,
  options?: Options
) => Promise<string>;
export type OutputArtworkFunction = (
  url1: string | undefined,
  url2: string | undefined,
  artPath: string,
  options: Options
) => Promise<boolean>;
export type CleanupArtworkFunction = (targetPath: string, romFolders: string[], options: Options) => Promise<void>;

export type OutputFormat = {
  useSeparateArtworks: SeparateArtworksFunction;
  prepareMachine?: PrepareMachineFunction;
  getArtPath: OutputPathFunction;
  exportArtwork: OutputArtworkFunction;
  cleanupArtwork: CleanupArtworkFunction;
  registerArtwork?: (context: ArtworkContext) => Promise<void>;
  finalizeMachine?: (folderPath: string, machine: string, options: Options) => Promise<void>;
};

type FormatRegistration = {
  adapter: OutputFormat;
  aliases?: string[];
};

const registrations: Record<string, FormatRegistration> = {
  [Format.MinUI]: { adapter: minui },
  [Format.NextUI]: { adapter: nextui },
  [Format.MuOS]: { adapter: muos },
  [Format.Knulli]: { adapter: knulli },
  [Format.TreeFrogUI]: { adapter: treefrogui, aliases: ['treefrog'] },
  [Format.OnionOS]: { adapter: anbernic, aliases: [Format.Onion] },
  [Format.GarlicOS]: { adapter: anbernic, aliases: ['garlic'] },
  [Format.SpruceOS]: { adapter: anbernic, aliases: ['spruce'] },
  [Format.AlliumOS]: { adapter: anbernic, aliases: ['allium'] },
  [Format.Anbernic]: { adapter: anbernic },
  [Format.Funkey]: { adapter: funkey },
  [Format.EsDe]: { adapter: esde, aliases: ['es-de'] }
};

const registry = new Map<string, OutputFormat>();
for (const [name, registration] of Object.entries(registrations)) {
  registry.set(name, registration.adapter);
  for (const alias of registration.aliases ?? []) registry.set(alias, registration.adapter);
}

export const supportedFormats = Object.freeze(Object.keys(registrations));

export async function getOutputFormat(options: Options): Promise<OutputFormat> {
  const name = options.output.toLowerCase();
  const format = registry.get(name);
  if (!format) {
    throw new Error(`Unknown format: ${options.output}. Supported formats: ${supportedFormats.join(', ')}`);
  }

  return format;
}
