import process from 'node:process';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname, basename } from 'node:path';
import { Command } from 'commander';
import debug from 'debug';
import updateNotifier from 'update-notifier';
import { type Options } from './options.js';
import { checkAi, DEFAULT_AI_URL, DEFAULT_AI_KEY } from './ai.js';
import { resetStats } from './stats.js';
import { getOutputFormat, supportedFormats } from './format/format.js';
import { scanLibrary, scrapeLibrary } from './core/index.js';
import { DEFAULT_BATCH_DELAY_MS, DEFAULT_BATCH_RETRIES, DEFAULT_BATCH_SIZE } from './cache.js';

type CliOptions = Options & {
  source?: string;
  retroachievementsUser?: string;
  retroachievementsKey?: string;
};

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function run(args: string[] = process.argv) {
  const file = await fs.readFile(join(__dirname, '..', 'package.json'), 'utf8');
  const packageJson: unknown = JSON.parse(file);
  if (!isPackageMetadata(packageJson)) {
    throw new TypeError('Invalid package metadata');
  }

  updateNotifier({ pkg: packageJson }).notify();
  resetStats();

  if (args.includes('--verbose')) {
    debug.enable('*');
  }

  const command = new Command()
    .name(basename(args[1] ?? 'mscraper'))
    .description(packageJson.description)
    .argument('<rompath>', 'Path to the folder containing the ROMs')
    .option('-w, --width <size>', 'Max width of the image', Number.parseFloat, 300)
    .option('-h, --height <size>', 'Max height of the image', Number.parseFloat)
    .option('-t, --type <type>', 'Art type (boxart, snap, title, box+snap, box+title)', 'boxart')
    .option('-o, --output <format>', `Artwork format (${supportedFormats.join(', ')})`, 'minui')
    .option('-a, --ai', 'Use AI for advanced matching', false)
    .option('-m, --ai-model <name>', 'AI model to use for matching', 'gemma2:2b')
    .option('--ai-url <url>', 'Base URL of the OpenAI-compatible AI provider', DEFAULT_AI_URL)
    .option('--ai-key <key>', 'API key for the AI provider (or set OPENAI_API_KEY)')
    .option('-r, --regions <regions>', 'Preferred regions to use for AI matching', 'World,Europe,USA,Japan')
    .option('-f, --force', 'Force scraping over existing images')
    .option('--cache-path <path>', 'Persistent artwork download cache directory')
    .option('--batch-size <count>', 'Network requests per batch', Number.parseInt, DEFAULT_BATCH_SIZE)
    .option('--batch-delay-ms <ms>', 'Delay between batches and retries', Number.parseInt, DEFAULT_BATCH_DELAY_MS)
    .option('--batch-retries <count>', 'Retries for failed downloads', Number.parseInt, DEFAULT_BATCH_RETRIES)
    .option('--media-path <path>', 'ES-DE downloaded_media directory')
    .option('--source <source>', 'Artwork source (automatic or retroachievements)', 'automatic')
    .option('--retroachievements-user <name>', 'RetroAchievements username (or set RETROACHIEVEMENTS_USER)')
    .option('--retroachievements-key <key>', 'RetroAchievements Web API key (or set RETROACHIEVEMENTS_API_KEY)')
    .option('--cleanup', 'Removes all scraped images in target folder')
    .option('--verbose', 'Show detailed logs')
    .version(packageJson.version, '-v, --version', 'Show current version')
    .helpCommand(false)
    .allowExcessArguments(false)
    .action(async (targetPath: string, options: CliOptions) => {
      const library = await scanLibrary(targetPath);
      if (library.systems.length === 0) {
        console.info('No ROM folders found');
        return;
      }

      const log = debug('cli');
      log(
        'Found ROM folders:',
        library.systems.map((system) => system.name)
      );

      if (options.cleanup) {
        const format = await getOutputFormat(options);
        await format.cleanupArtwork(
          library.romRootPath,
          library.systems.map((system) => system.name),
          options
        );
        return;
      }

      if (options.ai) {
        const client = await checkAi({
          url: options.aiUrl,
          apiKey: options.aiKey ?? process.env.OPENAI_API_KEY ?? DEFAULT_AI_KEY,
          model: options.aiModel
        });
        if (!client) {
          process.exitCode = 1;
          return;
        }

        options.aiClient = client;
      }

      if (options.source !== 'automatic' && options.source !== 'retroachievements') {
        throw new Error('Artwork source must be automatic or retroachievements.');
      }

      options.artworkSource = options.source;
      if (options.artworkSource === 'retroachievements') {
        const username = options.retroachievementsUser ?? process.env.RETROACHIEVEMENTS_USER;
        const webApiKey = options.retroachievementsKey ?? process.env.RETROACHIEVEMENTS_API_KEY;
        if (!username || !webApiKey) throw new Error('Set the RetroAchievements username and Web API key.');
        options.retroAchievementsCredentials = {
          username,
          webApiKey,
          baseUrl: process.env.MSCRAPER_RETROACHIEVEMENTS_URL
        };
      }

      const result = await scrapeLibrary(library, options);
      const elapsed = result.elapsedMs;
      const seconds = Math.floor((elapsed % (1000 * 60)) / 1000);
      const minutes = Math.floor((elapsed % (1000 * 60 * 60)) / (1000 * 60));

      console.info(`Scraped ${result.systems} folders (in ${minutes}m ${seconds}s)`);
      console.info(`- ${result.matches.perfect} perfect matches`);
      console.info(`- ${result.matches.partial} partial matches`);
      if (options.ai) console.info(`- ${result.matches.ai} AI matches`);
      console.info(`- ${result.matches.none} not found`);
      if (result.skipped) console.info(`- ${result.skipped} existing`);
      if (result.downloadFailures) console.info(`- ${result.downloadFailures} downloads failed after retries`);
    });

  await command.parseAsync(args);
}

function isPackageMetadata(value: unknown): value is { name: string; description: string; version: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    typeof value.name === 'string' &&
    'description' in value &&
    typeof value.description === 'string' &&
    'version' in value &&
    typeof value.version === 'string'
  );
}
