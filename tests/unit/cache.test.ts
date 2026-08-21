import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { DownloadManager } from '../../src/cache.js';
import { startMockServices } from '../helpers/mock-services.js';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  const pendingCleanups = [...cleanups];
  cleanups.length = 0;
  await Promise.all(pendingCleanups.map(async (cleanup) => cleanup()));
});

async function createCache() {
  const cachePath = await fs.mkdtemp(path.join(os.tmpdir(), 'mini-scraper-cache-'));
  cleanups.push(async () => fs.rm(cachePath, { recursive: true }));
  return cachePath;
}

describe('persistent download cache', () => {
  test('reuses a cached file across manager instances', async () => {
    const service = await startMockServices();
    const cachePath = await createCache();
    cleanups.push(service.close);
    const url = `${service.baseUrl}/art.png`;

    const first = await new DownloadManager({ cachePath, batchDelayMs: 0 }).get(url);
    const second = await new DownloadManager({ cachePath, batchDelayMs: 0 }).get(url);

    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    expect(second.buffer).toEqual(first.buffer);
    expect(service.requests.filter((request) => request.path === '/art.png')).toHaveLength(1);
  });

  test('pauses between batches and retries transient failures', async () => {
    const service = await startMockServices({ transientFailures: { '/retry.png': 1 } });
    const cachePath = await createCache();
    cleanups.push(service.close);
    const waits: number[] = [];
    const phases: string[] = [];
    const manager = new DownloadManager(
      {
        cachePath,
        batchSize: 1,
        batchDelayMs: 25,
        batchRetries: 2,
        onDownloadStatus(status) {
          phases.push(status.phase);
        }
      },
      async (milliseconds) => {
        waits.push(milliseconds);
      }
    );

    await manager.get(`${service.baseUrl}/first.png`);
    await manager.get(`${service.baseUrl}/retry.png`);

    expect(service.requests.filter((request) => request.path === '/retry.png')).toHaveLength(2);
    expect(waits).toEqual([25, 25, 25]);
    expect(phases).toEqual(['batch-pause', 'retrying', 'batch-pause', 'recovered']);
  });

  test('reports server throttling and failed downloads', async () => {
    const service = await startMockServices({
      transientFailures: { '/throttle.png': 1, '/failed.png': 3 },
      transientFailureStatus: 429,
      retryAfter: '0'
    });
    const cachePath = await createCache();
    cleanups.push(service.close);
    const phases: string[] = [];
    const manager = new DownloadManager({
      cachePath,
      batchDelayMs: 0,
      batchRetries: 1,
      onDownloadStatus(status) {
        phases.push(status.phase);
      }
    });

    await manager.get(`${service.baseUrl}/throttle.png`);
    await expect(manager.get(`${service.baseUrl}/failed.png`)).rejects.toThrow('Download failed after 2 attempts');

    expect(phases).toEqual(['server-throttled', 'recovered', 'server-throttled', 'failed']);
    expect(manager.failedDownloads).toBe(1);
  });

  test('coalesces simultaneous requests for the same URL', async () => {
    const service = await startMockServices();
    const cachePath = await createCache();
    cleanups.push(service.close);
    const manager = new DownloadManager({ cachePath, batchDelayMs: 0 });
    const url = `${service.baseUrl}/shared.png`;

    await Promise.all([manager.get(url), manager.get(url), manager.get(url)]);

    expect(service.requests.filter((request) => request.path === '/shared.png')).toHaveLength(1);
  });
});
