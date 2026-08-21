import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import { Buffer } from 'node:buffer';

export const DEFAULT_BATCH_SIZE = 100;
export const DEFAULT_BATCH_DELAY_MS = 1000;
export const DEFAULT_BATCH_RETRIES = 2;

export type DownloadPolicy = {
  cachePath?: string;
  batchSize?: number;
  batchDelayMs?: number;
  batchRetries?: number;
  onDownloadStatus?: (status: DownloadStatus) => void;
  downloadSignal?: AbortSignal;
};

export type DownloadStatus = {
  phase: 'batch-pause' | 'server-throttled' | 'retrying' | 'recovered' | 'failed';
  message: string;
  delayMs?: number;
  attempt?: number;
  maxAttempts?: number;
};

export type CachedDownload = {
  buffer: Uint8Array;
  fromCache: boolean;
};

type WaitFunction = (milliseconds: number, signal?: AbortSignal) => Promise<void>;

class HttpDownloadError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs?: number
  ) {
    super(message);
  }
}

async function defaultWait(milliseconds: number, signal?: AbortSignal) {
  await wait(milliseconds, undefined, signal ? { signal } : undefined);
}

export function defaultCachePath() {
  if (process.env.MSCRAPER_CACHE_DIR) return path.resolve(process.env.MSCRAPER_CACHE_DIR);
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, 'Mini Scraper', 'Cache');
  }

  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Caches', 'mini-scraper');
  return path.join(process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), '.cache'), 'mini-scraper');
}

export class DownloadManager {
  private readonly inFlight = new Map<string, Promise<CachedDownload>>();
  private readonly wait: WaitFunction;
  private readonly onStatus?: (status: DownloadStatus) => void;
  private readonly signal?: AbortSignal;
  private networkRequests = 0;
  private failures = 0;
  readonly cachePath: string;
  readonly batchSize: number;
  readonly batchDelayMs: number;
  readonly batchRetries: number;

  constructor(policy: DownloadPolicy = {}, waitFunction: WaitFunction = defaultWait) {
    this.cachePath = path.resolve(policy.cachePath ?? defaultCachePath());
    this.batchSize = positiveInteger(policy.batchSize, DEFAULT_BATCH_SIZE);
    this.batchDelayMs = nonNegativeInteger(policy.batchDelayMs, DEFAULT_BATCH_DELAY_MS);
    this.batchRetries = nonNegativeInteger(policy.batchRetries, DEFAULT_BATCH_RETRIES);
    this.wait = waitFunction;
    this.onStatus = policy.onDownloadStatus;
    this.signal = policy.downloadSignal;
  }

  private async readOrDownload(url: string, signal?: AbortSignal): Promise<CachedDownload> {
    const cacheFile = this.filePath(url);
    try {
      return { buffer: await fs.readFile(cacheFile), fromCache: true };
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.batchRetries; attempt++) {
      signal?.throwIfAborted();
      await this.waitForBatch(signal);
      try {
        const response = await fetch(url, { signal });
        if (!response.ok) {
          throw new HttpDownloadError(
            `HTTP ${response.status} ${response.statusText}`.trim(),
            response.status,
            parseRetryAfter(response.headers.get('retry-after') ?? undefined)
          );
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        await this.store(cacheFile, buffer);
        if (attempt > 0) {
          this.emit({ phase: 'recovered', message: `Download recovered after ${attempt} retries.` });
        }

        return { buffer, fromCache: false };
      } catch (error: unknown) {
        if (signal?.aborted) signal.throwIfAborted();
        lastError = error;
        if (attempt < this.batchRetries) {
          const delayMs =
            error instanceof HttpDownloadError && error.retryAfterMs !== undefined
              ? error.retryAfterMs
              : this.batchDelayMs;
          const nextAttempt = attempt + 1;
          const isThrottled = error instanceof HttpDownloadError && error.status === 429;
          this.emit({
            phase: isThrottled ? 'server-throttled' : 'retrying',
            message: isThrottled
              ? `The artwork server asked us to slow down. Retrying automatically in ${formatDelay(delayMs)} (${nextAttempt}/${this.batchRetries}).`
              : `Download failed. Retrying automatically in ${formatDelay(delayMs)} (${nextAttempt}/${this.batchRetries}).`,
            delayMs,
            attempt: nextAttempt,
            maxAttempts: this.batchRetries
          });
          if (delayMs > 0) await this.wait(delayMs, signal);
        }
      }
    }

    this.failures++;
    this.emit({
      phase: 'failed',
      message: `Download failed after ${this.batchRetries + 1} attempts. Moving on; run the scraper again to retry it.`,
      attempt: this.batchRetries,
      maxAttempts: this.batchRetries
    });
    throw new Error(
      `Download failed after ${this.batchRetries + 1} attempts: ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`
    );
  }

  private async waitForBatch(signal?: AbortSignal) {
    if (this.networkRequests > 0 && this.networkRequests % this.batchSize === 0 && this.batchDelayMs > 0) {
      this.emit({
        phase: 'batch-pause',
        message: `Downloaded a batch of ${this.batchSize}. Taking a ${formatDelay(this.batchDelayMs)} break before continuing.`,
        delayMs: this.batchDelayMs
      });
      await this.wait(this.batchDelayMs, signal);
    }

    this.networkRequests++;
  }

  private filePath(url: string) {
    const digest = createHash('sha256').update(url).digest('hex');
    return path.join(this.cachePath, 'artwork-v1', digest.slice(0, 2), digest);
  }

  private async store(cacheFile: string, buffer: Uint8Array) {
    await fs.mkdir(path.dirname(cacheFile), { recursive: true });
    const temporaryFile = `${cacheFile}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temporaryFile, buffer);
    await fs.rename(temporaryFile, cacheFile);
  }

  private emit(status: DownloadStatus) {
    this.onStatus?.(status);
  }

  get failedDownloads() {
    return this.failures;
  }

  async get(url: string, signal: AbortSignal | undefined = this.signal): Promise<CachedDownload> {
    signal?.throwIfAborted();
    const existing = this.inFlight.get(url);
    if (existing) return existing;

    const pending = this.readOrDownload(url, signal).finally(() => {
      this.inFlight.delete(url);
    });
    this.inFlight.set(url, pending);
    return pending;
  }

  async invalidate(url: string) {
    await fs.rm(this.filePath(url), { force: true });
  }
}

function parseRetryAfter(value: string | undefined) {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

function formatDelay(milliseconds: number) {
  if (milliseconds < 1000) return `${milliseconds} ms`;
  const seconds = milliseconds / 1000;
  return `${Number.isSafeInteger(seconds) ? seconds : seconds.toFixed(1)} s`;
}

function positiveInteger(value: number | undefined, fallback: number) {
  return Number.isSafeInteger(value) && value! > 0 ? value! : fallback;
}

function nonNegativeInteger(value: number | undefined, fallback: number) {
  return Number.isSafeInteger(value) && value! >= 0 ? value! : fallback;
}
