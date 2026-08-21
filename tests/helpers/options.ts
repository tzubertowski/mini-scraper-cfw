import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { ArtTypeOption, type Options } from '../../src/options.js';

export function createOptions(overrides: Partial<Options> = {}): Options {
  return {
    width: 300,
    type: ArtTypeOption.Boxart,
    ai: false,
    aiModel: 'test-model',
    aiUrl: 'http://localhost:11434/v1',
    regions: 'World,Europe,USA,Japan',
    output: 'minui',
    cachePath: path.join(os.tmpdir(), `mini-scraper-test-cache-${process.pid}`),
    batchSize: 100,
    batchDelayMs: 0,
    batchRetries: 0,
    ...overrides
  };
}
