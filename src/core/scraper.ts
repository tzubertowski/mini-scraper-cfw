import { type Options } from '../options.js';
import { resetStats, stats } from '../stats.js';
import { scrapeFolder } from '../libretro.js';
import { type LibraryScan } from './library.js';

export type ScrapeProgress = {
  completed: number;
  total: number;
  system: string;
  game: string;
};

export type ScrapeRuntime = {
  signal?: AbortSignal;
  onProgress?: (progress: ScrapeProgress) => void;
};

export type ScrapeResult = {
  cancelled: boolean;
  elapsedMs: number;
  systems: number;
  games: number;
  matches: { perfect: number; partial: number; ai: number; none: number };
  skipped: number;
  downloadFailures: number;
};

type ProgressState = { completed: number };

function snapshotResult(
  library: LibraryScan,
  options: Options,
  startedAt: number,
  completed: number,
  cancelled: boolean
): ScrapeResult {
  return {
    cancelled,
    elapsedMs: Date.now() - startedAt,
    systems: library.systems.length,
    games: completed,
    matches: { ...stats.matches },
    skipped: stats.skipped,
    downloadFailures: options.downloadManager?.failedDownloads ?? 0
  };
}

export async function scrapeLibrary(library: LibraryScan, options: Options, runtime: ScrapeRuntime = {}) {
  resetStats();
  const startedAt = Date.now();
  stats.startTime = startedAt;
  const progress = { completed: 0 };

  try {
    for (const system of library.systems) {
      runtime.signal?.throwIfAborted();
      await scrapeSystem({
        library,
        name: system.name,
        systemPath: system.path,
        options,
        runtime,
        progress
      });
    }

    return snapshotResult(library, options, startedAt, progress.completed, false);
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      return snapshotResult(library, options, startedAt, progress.completed, true);
    }

    throw error;
  }
}

async function scrapeSystem(context: {
  library: LibraryScan;
  name: string;
  systemPath: string;
  options: Options;
  runtime: ScrapeRuntime;
  progress: ProgressState;
}) {
  const { library, name, systemPath, options, runtime, progress } = context;
  await scrapeFolder(systemPath, options, {
    signal: runtime.signal,
    onFileComplete(game) {
      progress.completed++;
      runtime.onProgress?.({ completed: progress.completed, total: library.totalGames, system: name, game });
    }
  });
}
